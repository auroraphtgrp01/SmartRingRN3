/**
 * Class TimeSync
 * Xử lý đồng bộ thời gian giữa thiết bị và ứng dụng
 * 
 * Dựa trên TimeUtil.java từ mã nguồn gốc
 */
export class TimeSync {
  /**
   * Constants
   */
  public static readonly SETTING_TIME = 256; // Mã lệnh đồng bộ thời gian
  public static readonly SETTING_TIMEZONE = 68; // Mã lệnh đồng bộ múi giờ (0x44 = 68)

  /**
   * Tạo dữ liệu thời gian để gửi đến thiết bị
   * @returns Mảng byte chứa thông tin thời gian
   */
  public static makeBleTime(): Uint8Array {
    const calendar = new Date();
    const year = calendar.getFullYear();
    const month = calendar.getMonth() + 1; // Tháng trong JavaScript bắt đầu từ 0
    const day = calendar.getDate();
    const dayOfWeek = calendar.getDay(); // 0: Chủ nhật, 1-6: Thứ 2 đến Thứ 7
    const hour = calendar.getHours();
    const minute = calendar.getMinutes();
    const second = calendar.getSeconds();
    
    // Chuyển đổi thứ trong tuần theo định dạng của thiết bị
    // 0: Chủ nhật => 6, 1-6: Thứ 2-7 => 0-5
    const weekDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    // Tạo mảng byte theo định dạng của thiết bị
    return new Uint8Array([
      year & 0xFF,             // Năm (byte thấp)
      (year >> 8) & 0xFF,      // Năm (byte cao)
      month,                   // Tháng
      day,                     // Ngày
      hour,                    // Giờ
      minute,                  // Phút
      second,                  // Giây
      weekDay                  // Thứ trong tuần
    ]);
  }

  /**
   * Tạo dữ liệu thời gian với timestamp cụ thể để gửi đến thiết bị
   * @param timestamp Thời gian tính bằng mili giây
   * @returns Mảng byte chứa thông tin thời gian
   */
  public static makeBleTimeWithTimestamp(timestamp: number): Uint8Array {
    const calendar = new Date(timestamp);
    const year = calendar.getFullYear();
    const month = calendar.getMonth() + 1; // Tháng trong JavaScript bắt đầu từ 0
    const day = calendar.getDate();
    const dayOfWeek = calendar.getDay(); // 0: Chủ nhật, 1-6: Thứ 2 đến Thứ 7
    const hour = calendar.getHours();
    const minute = calendar.getMinutes();
    const second = calendar.getSeconds();
    
    // Chuyển đổi thứ trong tuần theo định dạng của thiết bị
    // 0: Chủ nhật => 6, 1-6: Thứ 2-7 => 0-5
    const weekDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    // Tạo mảng byte theo định dạng của thiết bị
    return new Uint8Array([
      year & 0xFF,             // Năm (byte thấp)
      (year >> 8) & 0xFF,      // Năm (byte cao)
      month,                   // Tháng
      day,                     // Ngày
      hour,                    // Giờ
      minute,                  // Phút
      second,                  // Giây
      weekDay                  // Thứ trong tuần
    ]);
  }

  /**
   * Tạo dữ liệu múi giờ để gửi đến thiết bị
   * @returns Mảng byte chứa thông tin múi giờ
   */
  public static makeBleTimeZone(): Uint8Array {
    // Lấy thời gian hiện tại
    const now = new Date();
    
    // Tính múi giờ (giờ)
    const offsetHours = -now.getTimezoneOffset() / 60;
    
    // Timestamp hiện tại tính bằng giây
    const timestamp = Math.floor(now.getTime() / 1000);
    
    console.log(`Múi giờ = ${offsetHours}`);
    
    // Tạo mảng byte theo định dạng của thiết bị (giống Java)
    return new Uint8Array([
      timestamp & 0xFF,
      (timestamp >> 8) & 0xFF,
      (timestamp >> 16) & 0xFF,
      (timestamp >> 24) & 0xFF,
      0,  // Java có 64-bit long, nhưng JS không cần
      0,
      0,
      0,
      offsetHours & 0xFF  // Byte múi giờ (byte thứ 9)
    ]);
  }

  /**
   * Phân tích mảng byte thành thông tin thời gian
   * @param data Mảng byte dữ liệu thời gian
   * @returns Object chứa thông tin thời gian đã được phân tích
   */
  public static parseTimeData(data: Uint8Array): any {
    if (data.length < 8) {
      return null;
    }
    
    const year = (data[1] << 8) | data[0];
    const month = data[2];
    const day = data[3];
    const hour = data[4];
    const minute = data[5];
    const second = data[6];
    const weekDay = data[7];
    
    // Chuyển thứ từ định dạng thiết bị (0-6: T2-CN) sang JavaScript (0: CN, 1-6: T2-T7)
    const dayOfWeek = weekDay === 6 ? 0 : weekDay + 1;
    
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      weekDay: dayOfWeek,
      // Tạo chuỗi thời gian dễ đọc
      formattedTime: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`
    };
  }

  /**
   * Đồng bộ thời gian với thiết bị
   * @param client Đối tượng YCBTClientImpl để giao tiếp với thiết bị
   * @param response Callback khi hoàn thành
   */
  public static syncTime(client: any, response: any = null): void {
    const timeData = this.makeBleTime();
    client.sendSingleData2Device(this.SETTING_TIME, timeData, 2, response);
  }

  /**
   * Đồng bộ thời gian với timestamp cụ thể
   * @param client Đối tượng YCBTClientImpl để giao tiếp với thiết bị
   * @param timestamp Thời gian tính bằng mili giây
   * @param response Callback khi hoàn thành
   */
  public static syncTimeWithTimestamp(client: any, timestamp: number, response: any = null): void {
    const timeData = this.makeBleTimeWithTimestamp(timestamp);
    client.sendSingleData2Device(this.SETTING_TIME, timeData, 2, response);
  }

  /**
   * Đồng bộ múi giờ với thiết bị
   * @param client Đối tượng YCBTClientImpl để giao tiếp với thiết bị
   * @param response Callback khi hoàn thành
   */
  public static syncTimeZone(client: any, response: any = null): void {
    const timeZoneData = this.makeBleTimeZone();
    
    console.log("TimeZone data:", Array.from(timeZoneData).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    // Sử dụng mã lệnh 68 thay vì 324
    client.sendSingleData2Device(this.SETTING_TIMEZONE, timeZoneData, 2, response);
  }

  /**
   * Kiểm tra xem hai thời điểm có cùng ngày không
   * @param timestamp1 Thời điểm thứ nhất (mili giây)
   * @param timestamp2 Thời điểm thứ hai (mili giây)
   * @returns true nếu cùng ngày, false nếu khác ngày
   */
  public static isSameDate(timestamp1: number, timestamp2: number): boolean {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);
    
    return date1.getFullYear() === date2.getFullYear() && 
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /**
   * Lấy số phút trong ngày từ timestamp
   * @param timestamp Thời gian tính bằng mili giây
   * @returns Số phút trong ngày
   */
  public static getMinutesInDay(timestamp: number): number {
    const date = new Date(timestamp);
    return date.getHours() * 60 + date.getMinutes();
  }

  /**
   * Lấy số giây trong ngày từ timestamp
   * @param timestamp Thời gian tính bằng mili giây
   * @returns Số giây trong ngày
   */
  public static getSecondsInDay(timestamp: number): number {
    const date = new Date(timestamp);
    return date.getHours() * 60 * 60 + date.getMinutes() * 60 + date.getSeconds();
  }
} 