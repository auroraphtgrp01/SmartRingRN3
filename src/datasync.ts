import { ycbtClientImpl } from './core/YCBT';
import { dataUnpack } from './utils/DataUnpack';

// Enum của trạng thái đồng bộ
export enum SyncState {
  START,
  SUCCESS,
  FAILED,
  END
}

// Interface cho sự kiện đồng bộ dữ liệu
export interface DataSyncEvent {
  callback: (state: SyncState) => void;
}

// Lớp DataSync để quản lý đồng bộ dữ liệu
class DataSync {
  private rawResponses: Map<number, any> = new Map();
  private rawPackets: string[] = [];
  private rawByteArrays: number[][] = [];

  // Phương thức để bắt đầu đồng bộ dữ liệu
  startDataSync(event: DataSyncEvent) {
    // Gọi callback START để thông báo bắt đầu đồng bộ
    event.callback(SyncState.START);
    
    // Xóa dữ liệu cũ
    this.rawResponses.clear();
    this.rawPackets = [];
    this.rawByteArrays = [];

    // Thực hiện đồng bộ dữ liệu sức khỏe
    this.syncHealthData(event);
  }

  // Phương thức để đồng bộ dữ liệu sức khỏe
  private async syncHealthData(event: DataSyncEvent) {
    try {
      // Định nghĩa các loại dữ liệu cần đồng bộ
      const healthDataTypes = [
        0x502, // Dữ liệu thể thao/bước chân
        0x504, // Dữ liệu giấc ngủ
        0x506, // Dữ liệu nhịp tim
        0x508, // Dữ liệu huyết áp
        0x509, // Dữ liệu tổng hợp
        0x52D, // Dữ liệu khác
        0x52F  // Dữ liệu khác
      ];

      console.log(`Bắt đầu đồng bộ ${healthDataTypes.length} loại dữ liệu sức khỏe`);

      // Sử dụng Promise.all để đồng bộ tất cả các loại dữ liệu
      await Promise.all(healthDataTypes.map(async (type, index) => {
        try {
          console.log(`Đồng bộ dữ liệu thứ ${index + 1}/${healthDataTypes.length}: 0x${type.toString(16).toUpperCase()}`);
          
          // Tạo Promise để đồng bộ dữ liệu
          return new Promise<void>((resolve, reject) => {
            // Đặt timeout cho quá trình đồng bộ (10 giây)
            const timeout = setTimeout(() => {
              console.log(`Timeout khi đồng bộ dữ liệu: 0x${type.toString(16).toUpperCase()}`);
              resolve(); // Resolve để tiếp tục với loại dữ liệu tiếp theo
            }, 10000);

            // Thiết lập callback cho response
            const dataResponse = {
              onDataResponse: (code: number, progress: number, data: any) => {
                clearTimeout(timeout);
                
                console.log(`Nhận được dữ liệu loại 0x${type.toString(16).toUpperCase()}, code: ${code}`);
                
                if (data) {
                  // Chuyển đổi dữ liệu sang chuỗi hex nếu có
                  const rawData = this.extractRawData(data);
                  if (rawData) {
                    // Lưu chuỗi hex
                    const hexString = rawData;
                    
                    // Chuyển hex sang mảng byte có dấu (-128 đến 127)
                    const byteArray = this.hexStringToBytes(hexString);
                    
                    // Lưu dữ liệu vào các mảng và map
                    this.rawResponses.set(type, {
                      code: code,
                      dataType: type,
                      raw: hexString
                    });
                    
                    this.rawPackets.push(hexString);
                    this.rawByteArrays.push(byteArray);
                    
                    console.log(`Đồng bộ thành công cho dữ liệu: 0x${type.toString(16).toUpperCase()}`);
                    console.log(`→ Dữ liệu hex: ${hexString}`);
                    console.log(`→ Dữ liệu byte: ${byteArray.join(',')}`);
                  } else {
                    console.log(`Không thể trích xuất dữ liệu thô cho: 0x${type.toString(16).toUpperCase()}`);
                  }
                } else {
                  // Nếu không có dữ liệu raw, có thể là lỗi hoặc không có dữ liệu
                  if (code !== 0) {
                    console.log(`Đồng bộ thất bại cho dữ liệu: 0x${type.toString(16).toUpperCase()}, code: ${code}`);
                  } else {
                    console.log(`Không có dữ liệu cho: 0x${type.toString(16).toUpperCase()}`);
                  }
                }
                
                // Hoàn thành Promise
                resolve();
              }
            };

            // Gửi yêu cầu đồng bộ dữ liệu sức khỏe
            console.log(`Gửi yêu cầu đồng bộ dữ liệu sức khỏe: 0x${type.toString(16).toUpperCase()}`);
            
            // Gọi API healthHistoryData để lấy dữ liệu từ thiết bị
            ycbtClientImpl.healthHistoryData(type, dataResponse);
          });
        } catch (error) {
          console.log(`Lỗi khi đồng bộ dữ liệu ${type}: ${error}`);
          return Promise.resolve(); // Tiếp tục với loại dữ liệu tiếp theo
        }
      }));

      // Sau khi đồng bộ hết các loại dữ liệu, thông báo thành công
      if (this.rawPackets.length > 0) {
        event.callback(SyncState.SUCCESS);
      } else {
        event.callback(SyncState.FAILED);
      }
    } catch (error) {
      console.log(`Lỗi khi đồng bộ dữ liệu: ${error}`);
      event.callback(SyncState.FAILED);
    } finally {
      // Kết thúc quá trình đồng bộ
      event.callback(SyncState.END);
    }
  }

  // Lấy dữ liệu raw responses
  getRawResponses(): Map<number, any> {
    return this.rawResponses;
  }

  // Lấy tất cả gói tin raw dưới dạng chuỗi hex
  getAllRawPackets(): string[] {
    return this.rawPackets;
  }

  // Lấy tất cả gói tin raw dưới dạng mảng byte có dấu
  getAllRawByteArrays(): number[][] {
    return this.rawByteArrays;
  }

  // Chuyển đổi mảng bytes có dấu (-128 đến 127) thành chuỗi hex
  bytesToHexString(bytes: number[]): string {
    return bytes.map(byte => {
      // Chuyển byte có dấu thành không dấu (0-255)
      const unsignedByte = byte < 0 ? byte + 256 : byte;
      return unsignedByte.toString(16).padStart(2, '0');
    }).join(' ');
  }

  // Chuyển đổi chuỗi hex thành mảng bytes có dấu
  hexStringToBytes(hex: string): number[] {
    const bytes: number[] = [];
    const cleanHex = hex.replace(/\s+/g, '');
    
    for (let i = 0; i < cleanHex.length; i += 2) {
      const byte = parseInt(cleanHex.substr(i, 2), 16);
      // Chuyển đổi từ không dấu (0-255) sang có dấu (-128 đến 127)
      bytes.push(byte > 127 ? byte - 256 : byte);
    }
    
    return bytes;
  }

  // Trích xuất dữ liệu thô từ response
  private extractRawData(data: any): string | null {
    // Nếu data đã có trường raw, sử dụng nó
    if (data.raw) {
      return data.raw;
    }
    
    // Nếu có trường data là mảng số, chuyển thành chuỗi hex
    if (Array.isArray(data.data)) {
      return data.data.map((b: number) => b.toString(16).padStart(2, '0')).join(' ');
    }
    
    // Nếu có thuộc tính data
    if (data.data) {
      const rawData = data.data;
      
      // Nếu là mảng
      if (Array.isArray(rawData)) {
        return rawData.map((b: number) => b.toString(16).padStart(2, '0')).join(' ');
      }
      
      // Nếu là object và có trường raw
      if (rawData.raw) {
        return rawData.raw;
      }
    }
    
    // Nếu không tìm thấy dữ liệu thô, trả về null
    return null;
  }
}

// Export singleton
export const dataSync = new DataSync();