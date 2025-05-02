import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

interface BleConnectResponse {
  onConnectResponse: (code: number) => void;
}

interface BleDataResponse {
  onDataResponse: (code: number, f: number, map: any) => void;
}

interface YCSendBean {
  willData: Uint8Array;
  dataType: number;
  groupType: number;
  sendPriority: number;
  mDataResponse: BleDataResponse | null;
  dataSendFinish: boolean;
  willSendFrame: () => Uint8Array | null;
  resetGroup: (dataType: number, data: Uint8Array) => void;
  collectStopReset?: () => void;
}

export class YCBTClientImpl {
  // Hằng số
  private static readonly BC_INT32_SHORT_MAX: number = 71;
  private static readonly DEFAULT_MTU: number = 500;
  public static readonly SERVICE_UUID: string = "be940000-7333-be46-b7ae-689e71722bd5";
  public static readonly NOTIFY_UUID: string = "be940001-7333-be46-b7ae-689e71722bd5";
  public static readonly WRITE_UUID: string = "be940001-7333-be46-b7ae-689e71722bd5";
  
  // Singleton instance
  private static instance: YCBTClientImpl;
  
  // Thuộc tính
  private bleManager: BleManager;
  private connectedDevice: Device | null = null;
  private mBleStateCode: number = 3;
  private isGattWriteCallBackFinish: boolean = true;
  private mSendQueue: YCSendBean[] = [];
  private mQueueSendState: boolean = false;
  private isRecvRealEcging: boolean = false;
  private sendingDataResponse: BleDataResponse | null = null;
  private mBleConnectResponse: BleConnectResponse | null = null;
  private mBleStatelistens: BleConnectResponse[] = [];
  private isFlag: boolean = false;
  private datas: Uint8Array | null = null;
  private mEndTimeOutCount: number = 0;
  private timeoutIds: Map<string, NodeJS.Timeout> = new Map();
  
  // Constructor
  private constructor() {
    this.bleManager = new BleManager();
  }
  
  // Xóa một timeout cụ thể
  private removeTimeout(id: string = 'dataTimeout'): void {
    if (this.timeoutIds.has(id)) {
      clearTimeout(this.timeoutIds.get(id));
      this.timeoutIds.delete(id);
      console.log(`Removed timeout: ${id}`);
    }
  }
  
  // Thiết lập timeout với ID
  private setTimeout(id: string, callback: () => void, delay: number): void {
    this.removeTimeout(id);
    const timeoutId = setTimeout(callback, delay);
    this.timeoutIds.set(id, timeoutId);
    console.log(`Set timeout: ${id}, delay: ${delay}ms`);
  }
  
  // Lấy instance singleton
  public static getInstance(): YCBTClientImpl {
    if (!YCBTClientImpl.instance) {
      YCBTClientImpl.instance = new YCBTClientImpl();
    }
    return YCBTClientImpl.instance;
  }
  
  // Kết nối với thiết bị BLE
  public connectBle(
    deviceId: string, 
    deviceName: string = "", 
    timeout: number = 15000,
    response: BleConnectResponse | null = null
  ): any {
    if (response) {
      this.mBleConnectResponse = response;
    }
    
    console.log(`connectBle deviceId=${deviceId}, isRepeat=true`);
    
    this.bleManager.connectToDevice(deviceId, { timeout })
      .then(device => {
        this.connectedDevice = device;
        console.log('Connected to device', deviceId);
        return device.discoverAllServicesAndCharacteristics();
      })
      .then(device => {
        this.bleStateResponse(9); // Đã kết nối, cần khám phá dịch vụ
        return device.services();
      })
      .then(services => {
        // Thiết lập notifications
        if (this.connectedDevice) {
          this.connectedDevice.monitorCharacteristicForService(
            YCBTClientImpl.SERVICE_UUID,
            YCBTClientImpl.NOTIFY_UUID,
            (error, characteristic) => {
              if (error) {
                console.log('Notification error:', error);
                return;
              }
              if (characteristic?.value) {
                const data = Buffer.from(characteristic.value, 'base64');
                this.bleDataResponse(0, new Uint8Array(data), YCBTClientImpl.NOTIFY_UUID);
              }
            }
          );
          
          this.bleStateResponse(10); // Đã kết nối đầy đủ và sẵn sàng
        }
      })
      .catch(error => {
        console.log('Connection error:', error);
        this.bleStateResponse(3); // Lỗi kết nối
      });
      return this.connectedDevice;
  }

  
  // Ngắt kết nối với thiết bị BLE
  public disconnectBle(): void {
    if (this.connectedDevice) {
      this.connectedDevice.cancelConnection()
        .then(() => {
          console.log('Disconnected from device');
          this.connectedDevice = null;
          this.bleStateResponse(3);
        })
        .catch(error => {
          console.log('Disconnect error:', error);
        });
    }
  }
  
  // Trạng thái kết nối hiện tại
  public connectState(): number {
    return this.mBleStateCode;
  }
  
  // Xử lý dữ liệu BLE nhận được
  public bleDataResponse(status: number, data: Uint8Array, uuid: string): void {
    if (uuid !== YCBTClientImpl.NOTIFY_UUID) {
      return;
    }
    
    if (!data || data.length === 0) {
      return;
    }
    
    let cmdId = 0;
    let key = 0;
    let length = 0;
    let dataOffset = 0;
    
    // Log dữ liệu gốc nhận được
    console.log("Received raw data:", Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    if (this.isFlag) {
      // Đang xử lý gói dữ liệu phân mảnh
      if (!this.datas) {
        console.log("Error: isFlag is true but datas is null");
        this.isFlag = false;
        return;
      }
      
      // Kết hợp các phần dữ liệu
      const combinedLength = this.datas.length + data.length;
      const combinedData = new Uint8Array(combinedLength);
      combinedData.set(this.datas);
      combinedData.set(data, this.datas.length);
      
      console.log("Combined BLE data length:", combinedLength);
      
      cmdId = combinedData[0] & 0xFF;
      key = combinedData[1] & 0xFF;
      length = (combinedData[2] & 0xFF) + ((combinedData[3] & 0xFF) << 8);
      
      if (length === combinedLength) {
        console.log("Combined data complete, length matches");
        this.isFlag = false;
        this.datas = null;
        data = combinedData;
        dataOffset = 4;
      } else {
        if (length > combinedLength) {
          console.log("Need more data fragments, waiting...");
          this.datas = combinedData;
          return;
        } else {
          console.log("Length mismatch in combined data. Expected:", length, "Got:", combinedLength);
          this.datas = null;
          this.isFlag = false;
          return;
        }
      }
    } else {
      // Xử lý gói dữ liệu mới
      if (data.length < 6) {
        console.log("Data too short, length:", data.length);
        return;
      }
      
      cmdId = data[0] & 0xFF;
      key = data[1] & 0xFF;
      length = (data[2] & 0xFF) + ((data[3] & 0xFF) << 8);
      dataOffset = 4;
      
      console.log(`Received response: cmdId=${cmdId}, key=${key}, length=${length}, dataLen=${data.length}`);
      
      if (length !== data.length) {
        if (data.length !== YCBTClientImpl.DEFAULT_MTU - 3) {
          console.log("Data length mismatch and not at MTU boundary");
          return;
        }
        
        console.log("Starting fragmented packet collection");
        this.isFlag = true;
        this.datas = data;
        return;
      }
    }
    
    // Kiểm tra CRC
    const expectedCRC = ((data[length - 2] & 0xFF) | ((data[length - 1] & 0xFF) << 8));
    const calculatedCRC = this.crc16_compute(data.slice(0, length - 2), length - 2);
    
    if (expectedCRC !== calculatedCRC) {
      console.log(`CRC mismatch. Expected: ${expectedCRC.toString(16)}, Calculated: ${calculatedCRC.toString(16)}`);
    } else {
      console.log("CRC check passed");
    }
    
    const dataLength = length - 6;
    
    // Trích xuất dữ liệu payload
    const payload = new Uint8Array(dataLength);
    for (let i = 0; i < dataLength; i++) {
      payload[i] = data[dataOffset + i];
    }
    
    // Kiểm tra xem gói này có khớp với yêu cầu hiện tại trong hàng đợi không
    const currentDataType = (cmdId << 8) + key;
    if (this.mSendQueue.length > 0) {
      if (this.mSendQueue[0].dataType === currentDataType) {
        console.log(`Matching response found for request type ${currentDataType}`);
        this.removeTimeout();
      } else {
        console.log(`Response type ${currentDataType} doesn't match expected ${this.mSendQueue[0].dataType}`);
      }
    }
    
    // Xử lý dữ liệu dựa trên ID lệnh
    this.processReceivedData(cmdId, key, payload, expectedCRC, dataLength);
  }
  
  // Xử lý dữ liệu nhận được dựa trên ID lệnh
  private processReceivedData(cmdId: number, key: number, data: Uint8Array, crc: number, dataLength: number): void {
    console.log(`Processing data: cmdId=${cmdId}, key=${key}, dataLength=${dataLength}`);
    
    // Kiểm tra lỗi trước
    if (this.isError(data)) {
      console.log("Error in received data:", data[0]);
      this.dataResponse(data[0], 0, null);
      this.popQueue();
      return;
    }
    
    // Xử lý theo loại gói
    if (cmdId === 1) {
      this.packetSettingHandle(key, data);
    } else if (cmdId === 2) {
      this.packetGetHandle(key, data);  // Gọi với dữ liệu đã lọc
    } else if (cmdId === 3) {
      this.packetAppControlHandle(key, data);
    } else {
      // Xử lý mặc định
      let responseMap = {
        data: Array.from(data),
        dataType: (cmdId << 8) + key
      };
      
      this.dataResponse(0, 0, responseMap);
      this.popQueue();
    }
  }
  
  // Xử lý gói thiết lập
  private packetSettingHandle(key: number, data: Uint8Array): void {
    let statusCode = 0;
    let responseMap = null;
    
    if (data && data.length > 0) {
      statusCode = data[0];
      
      if (data.length > 1) {
        responseMap = {
          data: data[1],
          dataType: this.mSendQueue.length > 0 ? this.mSendQueue[0].dataType : 0
        };
      }
    }
    
    console.log(`Setting packet: key=${key}, statusCode=${statusCode}`);
    
    if (this.sendingDataResponse) {
      this.sendingDataResponse.onDataResponse(statusCode, 0, responseMap);
    }
    
    this.popQueue();
  }
  
  // Xử lý gói GET
  private packetGetHandle(key: number, data: Uint8Array): void {
    console.log(`Handling GET packet with key=${key}, dataLength=${data?.length}`);
    let statusCode = 0;
    let responseMap = null;
    
    // Trường hợp lỗi
    if (this.isError(data)) {
      console.log(`Error in GET data, code: ${data[0]}`);
      this.dataResponse(data[0], 0, null);
      this.popQueue();
      return;
    }
    
    if (data && data.length > 0) {
      statusCode = data[0];
      
      if (data.length > 1) {
        // Tạo map dữ liệu phản hồi
        responseMap = {
          data: Array.from(data),
          dataType: (2 << 8) + key
        };
        
        // Xử lý đặc biệt cho một số key cụ thể
        if (key === 0) {
          // Key 0 - có thể là Get Device Info hoặc lệnh khác
          console.log("GET with key 0 - special processing may be required");
          // Xác định định dạng dữ liệu chính xác cho key=0
        } else if (key === 27) {
          // Key 27 - có thể là Get Device Version
          console.log("GET with key 27 - device version");
        }
        // Thêm các trường hợp đặc biệt khác nếu cần
      }
    }
    
    console.log(`Get packet response: key=${key}, statusCode=${statusCode}`);
    
    if (this.sendingDataResponse) {
      this.sendingDataResponse.onDataResponse(statusCode, 0, responseMap);
    }
    
    this.popQueue();
  }
  
  // Xử lý gói điều khiển
  private packetAppControlHandle(key: number, data: Uint8Array): void {
    let statusCode = 0;
    let responseMap = null;
    
    if (data && data.length > 0) {
      statusCode = data[0];
      
      if (data.length > 1) {
        responseMap = {
          data: Array.from(data),
          dataType: (3 << 8) + key
        };
      }
    }
    
    console.log(`App control packet: key=${key}, statusCode=${statusCode}`);
    
    if (this.sendingDataResponse) {
      this.sendingDataResponse.onDataResponse(statusCode, 0, responseMap);
    }
    
    this.popQueue();
  }
  
  // Kiểm tra lỗi trong dữ liệu
  private isError(data: Uint8Array): boolean {
    if (data && data.length === 1) {
      const b2 = data[0];
      if ((b2 & 0xF0) === 0xF0) {
        const errorCode = b2 & 0xFF;
        let errorMessage = "Unknown error";
        
        if (errorCode === 251) {
          errorMessage = "Unsupported Command ID";
        } else if (errorCode === 252) {
          errorMessage = "Unsupported Key";
        } else if (errorCode === 253) {
          errorMessage = "Length error";
        } else if (errorCode === 254) {
          errorMessage = "Data error";
        } else if (errorCode === 255) {
          errorMessage = "CRC16 check error";
        }
        
        console.log(errorMessage);
        return true;
      }
    }
    return false;
  }
  
  // Xử lý thay đổi trạng thái
  private bleStateResponse(state: number): void {
    console.log("connectState==", state);
    
    if (state === 6) {
      this.isRecvRealEcging = false;
      this.resetQueue();
    }
    
    this.mBleStateCode = state;
    
    if (state === 10) {
      try {
        console.log("Device fully connected and ready");
      } catch (e) {
        console.log(e);
      }
    }
    
    // Thông báo tất cả người nghe
    this.mBleStatelistens.forEach(listener => {
      listener.onConnectResponse(this.mBleStateCode);
    });
    
    if (this.mBleStateCode === 10 && this.mBleConnectResponse) {
      this.mBleConnectResponse.onConnectResponse(0);
    }
    
    if (this.mBleStateCode <= 3 && this.mBleConnectResponse) {
      this.mBleConnectResponse.onConnectResponse(1);
    }
    
    // Khởi tạo sau khi kết nối
    if (this.mBleStateCode === 9) {
      // Thiết lập thời gian hoặc khởi tạo khác
      this.sendSingleData2Device(256, new Uint8Array([0, 0, 0, 0, 0, 0]), 2, null);
    }
  }
  
  // Gửi dữ liệu đến thiết bị (phương thức chính)
  public sendSingleData2Device(
    dataType: number, 
    data: Uint8Array, 
    groupType: number = 2, 
    response: BleDataResponse | null = null
  ): void {
    console.log(`Sending data to device: dataType=${dataType}, dataLength=${data.length}, groupType=${groupType}`);
    
    // Kiểm tra và điều chỉnh dữ liệu cho các lệnh đặc biệt
    if (dataType === 512) { // GetDeviceInfo
      // Lệnh GetDeviceInfo cần dữ liệu chính xác là [71, 67] (0x47, 0x43)
      console.log(`GetDeviceInfo command detected, ensuring correct data format`);
      
      if (data.length !== 2 || data[0] !== 71 || data[1] !== 67) {
        console.log(`Correcting GetDeviceInfo data from [${Array.from(data)}] to [71, 67]`);
        data = new Uint8Array([71, 67]); // Đảm bảo định dạng chính xác
      }
    } else if (dataType === 513) { // GetDeviceSupportFunction
      // Đảm bảo định dạng chính xác cho lệnh GetDeviceSupportFunction
      if (data.length !== 2 || data[0] !== 71 || data[1] !== 70) {
        console.log(`Correcting GetDeviceSupportFunction data to [71, 70]`);
        data = new Uint8Array([71, 70]); // BC_INT32_SHORT_MAX, 'F'
      }
    } else if (dataType === 515) { // GetDeviceName
      // Đảm bảo định dạng chính xác cho lệnh GetDeviceName
      if (data.length !== 2 || data[0] !== 71 || data[1] !== 80) {
        console.log(`Correcting GetDeviceName data to [71, 80]`);
        data = new Uint8Array([71, 80]); // BC_INT32_SHORT_MAX, 'P'
      }
    }
    
    const sendBean: YCSendBean = {
      willData: data,
      dataType: dataType,
      groupType: groupType,
      sendPriority: 0,
      mDataResponse: response,
      dataSendFinish: false,
      willSendFrame: function() {
        return this.willData;
      },
      resetGroup: function(dataType: number, data: Uint8Array) {
        this.dataType = dataType;
        this.willData = data;
      },
      collectStopReset: function() {
        // Triển khai nếu cần
      }
    };
    
    if (dataType !== 2304 || data.length <= 0 || data[0] !== 0) {
      this.pushQueue(sendBean);
    }
  }
  
  // Thêm vào hàng đợi gửi
  private pushQueue(sendBean: YCSendBean): void {
    console.log("pushQueue groupType=", sendBean.groupType, "mSendQueue.size()=", this.mSendQueue.length);
    
    this.mSendQueue.push(sendBean);
    
    console.log("Queue size:", this.mSendQueue.length);
    
    if (!this.mQueueSendState && !this.isRecvRealEcging) {
      // Gọi frontQueue ngay lập tức nếu không có hoạt động nào đang diễn ra
      setTimeout(() => this.frontQueue(), 0);
    }
  }
  
  // Xử lý phần đầu của hàng đợi
  private frontQueue(): void {
    console.log("frontQueue", this.isGattWriteCallBackFinish);
    
    if (this.mSendQueue.length > 0) {
      try {
        const sendBean = this.mSendQueue[0];
        this.sendingDataResponse = sendBean.mDataResponse;
        
        if (this.isGattWriteCallBackFinish) {
          const willSendFrame = sendBean.willSendFrame();
          
          if (willSendFrame && (this.mBleStateCode === 10 || this.mBleStateCode === 9)) {
            this.mQueueSendState = true;
            
            // Thiết lập timeout để tránh bị treo
            this.setTimeout('dataTimeout', () => {
              console.log("Data send timeout - no response received");
              if (this.mSendQueue.length > 0 && this.mSendQueue[0] === sendBean) {
                this.mEndTimeOutCount++;
                if (this.mEndTimeOutCount >= 3) {
                  console.log("Max retries reached, abandoning request");
                  this.mEndTimeOutCount = 0;
                  if (this.sendingDataResponse) {
                    this.sendingDataResponse.onDataResponse(1, 0, null);
                  }
                  this.popQueue();
                } else {
                  console.log(`Retry attempt ${this.mEndTimeOutCount}`);
                  this.isGattWriteCallBackFinish = true;
                  this.frontQueue(); // Thử lại
                }
              }
            }, 5000);
            
            this.sendData2Device(sendBean.dataType, willSendFrame);
            
          } else if (willSendFrame) {
            console.log("willSendFrame exists but not ready to send");
            this.popQueue();
          } else {
            console.log("willSendFrame is null");
            this.popQueue();
          }
        } else {
          console.log("Gatt write not finished, waiting");
        }
      } catch (e) {
        console.log("Error in frontQueue:", e);
        this.isGattWriteCallBackFinish = true; // Đặt lại để tránh bị treo
        setTimeout(() => this.frontQueue(), 500); // Thử lại sau lỗi
      }
    }
  }
  
  // Gửi dữ liệu thực tế đến thiết bị
  private sendData2Device(dataType: number, data: Uint8Array): void {
    const length = data.length + 6;
    const packet = new Uint8Array(length);
    
    // Header
    packet[0] = (dataType >> 8) & 0xFF;
    packet[1] = dataType & 0xFF;
    packet[2] = length & 0xFF;
    packet[3] = (length >> 8) & 0xFF;
    
    // Dữ liệu
    for (let i = 0; i < data.length; i++) {
      packet[i + 4] = data[i];
    }
    
    // Tính toán CRC
    const crc = this.crc16_compute(packet.slice(0, length - 2), length - 2);
    packet[length - 2] = crc & 0xFF;
    packet[length - 1] = (crc >> 8) & 0xFF;
    
    // Log gói dữ liệu để debug
    console.log("Sending packet:", Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    this.isGattWriteCallBackFinish = false;
    
    // Ghi đến thiết bị
    if (this.connectedDevice) {
      const base64Data = Buffer.from(packet).toString('base64');
      this.connectedDevice.writeCharacteristicWithResponseForService(
        YCBTClientImpl.SERVICE_UUID,
        YCBTClientImpl.WRITE_UUID,
        base64Data
      )
      .then(() => {
        console.log("Write successful for dataType:", dataType);
        this.isGattWriteCallBackFinish = true;
        
        // KHÔNG gọi popQueue ở đây, đợi phản hồi từ bleDataResponse
        // Chỉ xử lý các trường hợp mà chúng ta biết không cần phản hồi
        if (!this.shouldExpectResponse(dataType)) {
          setTimeout(() => this.popQueue(), 100);
        }
      })
      .catch(error => {
        console.log("Write error:", error);
        this.isGattWriteCallBackFinish = true;
        // Xóa khỏi hàng đợi trong trường hợp lỗi
        setTimeout(() => this.popQueue(), 100);
      });
    } else {
      console.log("No connected device");
      this.isGattWriteCallBackFinish = true;
      setTimeout(() => this.popQueue(), 0);
    }
  }
  
  // Kiểm tra xem loại dữ liệu cụ thể có cần đợi phản hồi không
  private shouldExpectResponse(dataType: number): boolean {
    // Các loại dữ liệu cần phản hồi dựa trên mã Java gốc
    const typesExpectingResponse = [256, 512, 513, 768, 1024, 2560];
    return typesExpectingResponse.includes(dataType);
  }
  
  // Tính toán CRC16 dựa trên thuật toán chính xác từ ByteUtil.java
  private crc16_compute(data: Uint8Array, length: number): number {
    let crc = 0xFFFF; // Khởi tạo với -1 (0xFFFF) giống Java
    
    for (let i = 0; i < length; i++) {
      // Xoay crc 8 bit và XOR với byte hiện tại
      crc = (((crc >> 8) | (crc << 8)) & 0xFFFF);
      crc ^= (data[i] & 0xFF);
      
      // XOR với 4 bit phải của byte thấp
      crc ^= ((crc & 0xFF) >> 4);
      
      // XOR với byte cao dịch trái 4 bit
      crc ^= ((crc << 12) & 0xFFFF);
      
      // XOR với byte thấp dịch trái 5 bit
      crc ^= (((crc & 0xFF) << 5) & 0xFFFF);
    }
    
    return crc & 0xFFFF;
  }
  
  // Đặt lại hàng đợi
  public resetQueue(): void {
    console.log("resetQueue");
    this.mQueueSendState = false;
    this.isRecvRealEcging = false;
    this.isGattWriteCallBackFinish = true;
    this.mSendQueue = [];
    
    // Xóa tất cả timeouts
    for (const id of this.timeoutIds.keys()) {
      this.removeTimeout(id);
    }
  }
  
  // Xử lý hoàn thành thao tác
  private popQueue(): void {
    if (this.mSendQueue.length > 0) {
      console.log("popQueue Gatt write callback", this.isGattWriteCallBackFinish);
      
      if (this.isGattWriteCallBackFinish) {
        this.removeTimeout('dataTimeout');
        this.mSendQueue.shift();
        this.mQueueSendState = false;
        this.mEndTimeOutCount = 0;
        
        console.log("Queue remaining size", this.mSendQueue.length);
        
        if (!this.isRecvRealEcging && this.mSendQueue.length > 0) {
          // Đảm bảo có độ trễ nhỏ trước khi xử lý mục tiếp theo trong hàng đợi
          setTimeout(() => this.frontQueue(), 100);
        }
      } else {
        this.mSendQueue[0].dataSendFinish = true;
        console.log("Marked current request as finished, waiting for write callback");
      }
    }
  }
  
  // Gửi dữ liệu và xử lý phản hồi
  private dataResponse(code: number, f: number, hashMap: any | null): void {
    try {
      console.log("dataResponse code=", code, "response=", this.sendingDataResponse ? "exists" : "null");
      
      if (this.sendingDataResponse) {
        this.sendingDataResponse.onDataResponse(code, 0.0, hashMap);
      }
    } catch (e) {
      console.log("Error in dataResponse:", e);
    }
  }
  
  // Đăng ký cho các thay đổi trạng thái BLE
  public registerBleStateChangeCallBack(response: BleConnectResponse): void {
    this.mBleStatelistens.push(response);
  }
  
  // Hủy đăng ký khỏi các thay đổi trạng thái BLE
  public unregisterBleStateChangeCallBack(response: BleConnectResponse): void {
    const index = this.mBleStatelistens.indexOf(response);
    if (index >= 0) {
      this.mBleStatelistens.splice(index, 1);
    }
  }
}

export const ycbtClientImpl = YCBTClientImpl.getInstance();