import { ycbtClientImpl } from './core/YCBT';

// Các hằng số cho loại dữ liệu health
export enum DataTypes {
  Health_HistorySport = 0x502,        // 1282
  Health_HistorySleep = 0x504,        // 1284
  Health_HistoryHeart = 0x506,        // 1286
  Health_HistoryBlood = 0x508,        // 1288
  Health_HistoryAll = 0x509,          // 1289
  Health_HistorySportMode = 0x52D,    // 1325
  Health_HistoryComprehensiveMeasureData = 0x52F,  // 1327
  Health_DeleteSport = 0x544,         // 1348
  Health_DeleteSleep = 0x545,         // 1349
  Health_DeleteHeart = 0x546,         // 1350
  Health_DeleteBlood = 0x547,         // 1351
  Health_DeleteAll = 0x548,           // 1352
  Health_DeleteSportMode = 0x549,     // 1353
  Health_DeleteComprehensiveMeasureData = 0x54A,  // 1354
  Health_Physiotherapy = 0xD75,       // 3445
}

export enum SyncState {
  START = 'START',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  END = 'END'
}

interface DataSyncEventCallback {
  (state: SyncState): void;
}

export interface BleDataResponse {
  onDataResponse: (code: number, f: number, map: any) => void;
}

// Tạo interface cho DataSyncEvent để tương thích với Java
export interface DataSyncEvent {
  callback: DataSyncEventCallback;
}

// Interface để lưu trữ dữ liệu hex raw
interface HexData {
  raw: string;      // Dữ liệu raw dạng hex
  code: number;     // Mã kết quả
  timestamp: number; // Thời gian nhận
}

export class DataSync {
  private static instance: DataSync;
  private syncing: boolean = false;
  private endDataType: number = 0;
  private finishDataType: number = 0;
  private event: DataSyncEvent | null = null;
  private isSyncDataSuccess: boolean = true;
  private rawResponses: Map<number, HexData> = new Map();
  private rawPackets: string[] = [];  // Lưu trữ tất cả các gói dữ liệu raw

  // Singleton pattern
  private constructor() {
    // Ghi đè console.log để bắt các log từ YCBT
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(' ');
      if (message.includes('Received raw data:')) {
        // Lưu lại packet raw
        const hexData = message.split('Received raw data:')[1].trim();
        this.rawPackets.push(hexData);
      }
      originalLog.apply(console, args);
    };
  }

  public static getInstance(): DataSync {
    if (!DataSync.instance) {
      DataSync.instance = new DataSync();
    }
    return DataSync.instance;
  }

  /**
   * Bắt đầu quá trình đồng bộ dữ liệu
   * @param event Callback để báo trạng thái đồng bộ
   */
  public startDataSync(event: DataSyncEvent): void {
    this.event = event;
    this.rawPackets = []; // Reset gói raw
    event.callback(SyncState.START);
    
    // Kiểm tra trạng thái kết nối
    const connectState = ycbtClientImpl.connectState();
    if (connectState === 10) {
      this.syncData();
    } else {
      console.log(`Không thể đồng bộ, trạng thái kết nối: ${connectState}`);
      event.callback(SyncState.END);
    }
  }

  /**
   * Thực hiện đồng bộ tất cả các loại dữ liệu health
   */
  private syncData(): void {
    this.syncing = true;
    this.isSyncDataSuccess = true;
    this.endDataType = 0;
    this.finishDataType = 0;
    this.rawResponses.clear();
    
    // Danh sách các loại dữ liệu cần đồng bộ
    const dataTypes = [
      DataTypes.Health_HistorySport,
      DataTypes.Health_HistorySleep,
      DataTypes.Health_HistoryHeart,
      DataTypes.Health_HistoryBlood,
      DataTypes.Health_HistoryAll,
      DataTypes.Health_HistoryComprehensiveMeasureData,
      DataTypes.Health_HistorySportMode,
      DataTypes.Health_Physiotherapy
    ];
    
    console.log("Bắt đầu đồng bộ dữ liệu sức khỏe");
    
    // Đồng bộ loại dữ liệu đầu tiên
    this.syncCurrentType(dataTypes, 0);
  }

  /**
   * Đồng bộ theo thứ tự các loại dữ liệu
   * @param dataTypes Danh sách loại dữ liệu cần đồng bộ
   * @param index Chỉ số loại dữ liệu hiện tại
   */
  private syncCurrentType(dataTypes: number[], index: number): void {
    if (index >= dataTypes.length) {
      console.log("Đã đồng bộ tất cả loại dữ liệu");
      if (this.event) {
        this.event.callback(SyncState.END);
      }
      this.finishDataType = this.endDataType;
      return;
    }

    const dataType = dataTypes[index];
    console.log(`Đồng bộ dữ liệu thứ ${index + 1}/${dataTypes.length}: 0x${dataType.toString(16).toUpperCase()}`);
    
    // Đặt một timeout để đảm bảo không bị treo khi đồng bộ
    const syncTimeout = setTimeout(() => {
      console.log(`Timeout khi đồng bộ dữ liệu 0x${dataType.toString(16).toUpperCase()}, tiếp tục với loại tiếp theo`);
      this.syncCurrentType(dataTypes, index + 1);
    }, 10000); // 10 giây timeout
    
    // Lưu timeout vào đối tượng cho việc hủy
    (this as any).currentSyncTimeout = syncTimeout;
    
    // Thiết lập callback cho phương thức getWatchesData
    const syncCallback = (code: number, result: any) => {
      // Hủy timeout
      clearTimeout(syncTimeout);
      delete (this as any).currentSyncTimeout;
      
      // Lưu dữ liệu raw nhận được từ thiết bị (nếu có)
      let rawHex = '';
      if (this.rawPackets.length > 0) {
        rawHex = this.rawPackets[this.rawPackets.length - 1];
        console.log(`Đồng bộ ${code === 0 ? 'thành công' : 'thất bại'}, dữ liệu raw: ${rawHex}`);
      }
      
      this.watchesResponse(dataType, code, result, rawHex);
      
      // Đồng bộ loại tiếp theo sau 500ms
      setTimeout(() => {
        this.syncCurrentType(dataTypes, index + 1);
      }, 500);
    };
    
    // Thực hiện lấy dữ liệu
    this.getWatchesDataWithCallback(dataType, syncCallback);
  }
  
  /**
   * Lấy dữ liệu từ thiết bị với callback cụ thể
   * @param dataType Loại dữ liệu cần lấy
   * @param callback Hàm callback khi hoàn thành
   */
  private getWatchesDataWithCallback(dataType: number, callback: (code: number, result: any) => void): void {
    console.log(`Đang lấy dữ liệu: ${dataType.toString(16)}`);
    
    if (dataType === DataTypes.Health_Physiotherapy) {
      console.log(`Đồng bộ dữ liệu Physiotherapy: ${dataType}`);
      ycbtClientImpl.sendDataType2Device(
        dataType, 
        3, 
        new Uint8Array([2]), 
        2, 
        {
          onDataResponse: (code: number, f: number, hashMap: any) => {
            callback(code, hashMap);
          }
        }
      );
    } else {
      console.log(`Đồng bộ dữ liệu sức khỏe: ${dataType}`);
      ycbtClientImpl.sendDataType2Device(
        dataType, 
        3, 
        new Uint8Array([dataType & 0xFF]), 
        2, 
        {
          onDataResponse: (code: number, f: number, hashMap: any) => {
            callback(code, hashMap);
          }
        }
      );
    }
  }
  
  /**
   * Lấy dữ liệu từ thiết bị cho một loại dữ liệu cụ thể
   * @param dataType Loại dữ liệu cần lấy
   */
  public getWatchesData(dataType: number): void {
    this.getWatchesDataWithCallback(dataType, (code, result) => {
      let rawHex = '';
      if (this.rawPackets.length > 0) {
        rawHex = this.rawPackets[this.rawPackets.length - 1];
      }
      this.watchesResponse(dataType, code, result, rawHex);
    });
  }

  /**
   * Xử lý phản hồi từ thiết bị
   * @param dataType Loại dữ liệu
   * @param code Mã trạng thái
   * @param result Dữ liệu kết quả
   * @param rawHex Dữ liệu hex raw
   */
  private watchesResponse(dataType: number, code: number, result: any, rawHex: string): void {
    if (code === 0) {
      console.log(`Đồng bộ thành công cho dữ liệu: ${dataType.toString(16)}`);
      
      // Lưu dữ liệu raw vào map
      this.rawResponses.set(dataType, {
        raw: rawHex,
        code: code,
        timestamp: Date.now()
      });
      
      this.endDataType = dataType;
    } else {
      if (code !== 0 && code !== -4) {
        this.isSyncDataSuccess = false;
      }
      console.log(`Đồng bộ thất bại cho dữ liệu: ${dataType.toString(16)}, code: ${code}`);
      
      // Vẫn lưu lại dữ liệu lỗi để debug
      this.rawResponses.set(dataType, {
        raw: rawHex,
        code: code,
        timestamp: Date.now()
      });
    }
    
    this.changedSyncState(dataType);
  }

  /**
   * Xóa dữ liệu lịch sử trên thiết bị sau khi đồng bộ thành công
   * @param type Loại dữ liệu cần xóa
   */
  private deleteWatchesHistoryData(type: number): void {
    if (type === DataTypes.Health_Physiotherapy) {
      ycbtClientImpl.sendDataType2Device(
        type, 
        3, 
        new Uint8Array([2, 2]), 
        2, 
        {
          onDataResponse: (code: number, f: number, hashMap: any) => {
            console.log(`Xóa dữ liệu ${type.toString(16)} ${code === 0 ? 'thành công' : 'thất bại'}`);
          }
        }
      );
    } else {
      ycbtClientImpl.sendDataType2Device(
        type, 
        3, 
        new Uint8Array([type & 0xFF]), 
        2, 
        {
          onDataResponse: (code: number, f: number, hashMap: any) => {
            console.log(`Xóa dữ liệu ${type.toString(16)} ${code === 0 ? 'thành công' : 'thất bại'}`);
          }
        }
      );
    }
  }

  /**
   * Cập nhật trạng thái đồng bộ
   * @param dataType Loại dữ liệu vừa đồng bộ xong
   */
  private changedSyncState(dataType: number): void {
    if (this.endDataType === dataType) {
      this.syncing = false;
      
      if (this.isSyncDataSuccess) {
        console.log("Đồng bộ thành công");
        
        // // Xóa dữ liệu trên thiết bị sau khi đồng bộ thành công
        // if (dataType === DataTypes.Health_HistorySport) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteSport);
        // } else if (dataType === DataTypes.Health_HistorySleep) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteSleep);
        // } else if (dataType === DataTypes.Health_HistoryHeart) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteHeart);
        // } else if (dataType === DataTypes.Health_HistorySportMode) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteSportMode);
        // } else if (dataType === DataTypes.Health_HistoryComprehensiveMeasureData) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteComprehensiveMeasureData);
        // } else if (dataType === DataTypes.Health_Physiotherapy) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_Physiotherapy);
        // } else if (dataType === DataTypes.Health_HistoryBlood) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteBlood);
        // } else if (dataType === DataTypes.Health_HistoryAll) {
        //   this.deleteWatchesHistoryData(DataTypes.Health_DeleteAll);
        // }
        
        if (this.event) {
          this.event.callback(SyncState.SUCCESS);
        }
      } else {
        console.log("Đồng bộ thất bại");
        if (this.event) {
          this.event.callback(SyncState.FAILED);
        }
        
        // Reset hàng đợi
        ycbtClientImpl.resetQueue();
      }
    }
  }

  /**
   * Lấy dữ liệu raw dạng hex đã đồng bộ
   * @returns Map chứa dữ liệu đã đồng bộ theo loại
   */
  public getRawResponses(): Map<number, HexData> {
    return this.rawResponses;
  }
  
  /**
   * Lấy tất cả các gói dữ liệu raw
   * @returns Mảng các gói dữ liệu raw
   */
  public getAllRawPackets(): string[] {
    return this.rawPackets;
  }
  
  /**
   * Kiểm tra xem đang trong quá trình đồng bộ hay không
   * @returns true nếu đang đồng bộ
   */
  public isSyncing(): boolean {
    return this.syncing;
  }
  
  /**
   * Hủy bỏ đồng bộ và giải phóng tài nguyên
   */
  public release(): void {
    this.syncing = false;
    this.event = null;
    this.rawResponses.clear();
    this.rawPackets = [];
  }
}

// Export singleton instance
export const dataSync = DataSync.getInstance(); 