import { BleManager, Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { SERVICE_UUID, WRITE_UUID } from '../constants';

class HealthDataSync {
  private bleManager: BleManager;
  private device: Device | null = null;
  private serviceUUID: string = SERVICE_UUID; // Thay bằng UUID dịch vụ thực
  private characteristicUUID: string = WRITE_UUID; // Thay bằng UUID đặc tính thực

  constructor() {
    this.bleManager = new BleManager();
  }

  // Hàm tính CRC-16
  private calculateCRC(data: number[], length: number, initialCRC: number = 0xFFFF): number {
    let crc = initialCRC & 0xFFFF;

    for (let i = 0; i < length; i++) {
      let temp = (crc << 8) & 0xFF00;
      temp |= (crc >> 8) & 0xFF;
      temp ^= data[i] & 0xFF;
      temp ^= (temp & 0xFF) >> 4;
      let s2 = temp & 0xFFFF;

      let s3 = s2 ^ ((s2 << 8) << 4);
      crc = s3 ^ (((s3 & 0xFF) << 4) << 1);
    }

    return crc & 0xFFFF;
  }

  // Kết nối đến thiết bị BLE
  async connectToDevice(deviceId: string): Promise<Device> {
    console.log('>>>>>>>> >>> >>> Kết nối đến thiết bị:', deviceId);
    this.device = await this.bleManager.connectToDevice(deviceId);
    await this.device.discoverAllServicesAndCharacteristics();
    return this.device;
  }

  private async sendHealthHistoryRequest(dataType: number): Promise<void> {
    if (!this.device) {
      throw new Error('Thiết bị chưa được kết nối');
    }
    const commandHigh = (dataType >> 8) & 0xff; // Byte cao của dataType
    const commandLow = dataType & 0xff;         // Byte thấp của dataType
    const length = 6;                           // Tổng độ dài gói: 4 (HEADER) + 0 (DATA) + 2 (CRC)
    const header = [commandHigh, commandLow, length & 0xff, (length >> 8) & 0xff];

    // DATA: 0 bytes (yêu cầu không có dữ liệu gửi đi)
    const data: number[] = [];

    // Tính CRC cho HEADER + DATA
    const crcData = [...header, ...data];
    const crc = this.calculateCRC(crcData, crcData.length);

    // Tạo gói dữ liệu hoàn chỉnh: HEADER + DATA + CRC
    const packet = [...header, ...data, crc & 0xff, (crc >> 8) & 0xff];

    // Chuyển sang Buffer để gửi qua BLE
    const buffer = Buffer.from(packet);

    // Gửi gói dữ liệu đến thiết bị
    await this.device.writeCharacteristicWithResponseForService(
      this.serviceUUID,
      this.characteristicUUID,
      buffer.toString('base64')
    );
  }

  async syncSportData(): Promise<void> {
    await this.sendHealthHistoryRequest(1282); // DataType: 0x0502
  }

  async syncSleepData(): Promise<void> {
    await this.sendHealthHistoryRequest(1284); // DataType: 0x0504
  }

  async syncHeartRateData(): Promise<void> {
    await this.sendHealthHistoryRequest(1286); // DataType: 0x0506
  }

  async syncBloodPressureData(): Promise<void> {
    await this.sendHealthHistoryRequest(1288); // DataType: 0x0508
  }

  async startListeningForResponses(callback: (data: Buffer) => void): Promise<void> {
    if (!this.device) {
      throw new Error('Thiết bị chưa được kết nối');
    }

    this.device.monitorCharacteristicForService(
      this.serviceUUID,
      this.characteristicUUID,
      (error, characteristic) => {
        if (error) {
          console.error('Lỗi khi nhận dữ liệu:', error);
          return;
        }
        if (characteristic?.value) {
          const data = Buffer.from(characteristic.value, 'base64');
          const bytes = Buffer.from(characteristic?.value, 'base64').toJSON().data;
          console.log("Nhận được dữ liệu:", bytes.map(b => b.toString(16).padStart(2, '0')).join(' '));
          callback(data); // Trả dữ liệu về qua callback
        }
      }
    );
  }

  // Ngắt kết nối thiết bị
  async disconnect(): Promise<void> {
    if (this.device) {
      await this.bleManager.cancelDeviceConnection(this.device.id);
      this.device = null;
    }
  }
}

export const healthDataSync = new HealthDataSync();

export default HealthDataSync;