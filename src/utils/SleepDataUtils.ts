import { SLEEP_TYPE } from '../constants';

// Cấu trúc dữ liệu cho một giai đoạn giấc ngủ
export interface SleepStage {
  type: number;            // Loại giấc ngủ (sâu, nhẹ, REM, thức giấc)
  startTime: number;       // Thời gian bắt đầu (timestamp)
  duration: number;        // Thời lượng (giây)
  heartRate?: number;      // Nhịp tim (nếu có)
}

// Cấu trúc dữ liệu cho tổng quan giấc ngủ một ngày
export interface SleepData {
  date: string;                       // Ngày của dữ liệu giấc ngủ (YYYY-MM-DD)
  startTime: number;                  // Thời gian bắt đầu ngủ (timestamp)
  endTime: number;                    // Thời gian kết thúc ngủ (timestamp)
  deepSleepTotal: number;            // Tổng thời gian ngủ sâu (giây)
  lightSleepTotal: number;           // Tổng thời gian ngủ nhẹ (giây)
  remSleepTotal: number;             // Tổng thời gian REM (giây)
  awakeDuration: number;             // Tổng thời gian thức giấc (giây)
  wakeCount: number;                 // Số lần thức giấc
  stages: SleepStage[];              // Chi tiết các giai đoạn giấc ngủ
}

/**
 * Phân tích dữ liệu giấc ngủ nhận được từ thiết bị
 * @param data Dữ liệu thô nhận được từ thiết bị
 * @returns Dữ liệu giấc ngủ đã phân tích
 */
export function parseSleepData(data: any): SleepData[] {
  const sleepResults: SleepData[] = [];
  
  // Kiểm tra nếu không có dữ liệu
  if (!data || !data.data || !Array.isArray(data.data)) {
    console.log('Không có dữ liệu giấc ngủ hoặc định dạng không hợp lệ');
    return sleepResults;
  }
  
  try {
    // Duyệt qua mỗi phần tử trong mảng dữ liệu
    for (const item of data.data) {
      // Kiểm tra các trường cần thiết
      if (!item.hasOwnProperty('startTime') || !item.hasOwnProperty('endTime')) {
        console.log('Bỏ qua mục dữ liệu thiếu thông tin thời gian', item);
        continue;
      }
      
      // Tạo một đối tượng SleepData mới
      const sleepData: SleepData = {
        date: formatDateFromTimestamp(item.startTime * 1000),
        startTime: item.startTime,
        endTime: item.endTime,
        deepSleepTotal: item.deepSleepTotal || 0,
        lightSleepTotal: item.lightSleepTotal || 0,
        remSleepTotal: item.rapidEyeMovementTotal || 0,
        awakeDuration: item.awakeDuration || 0,
        wakeCount: item.wakeCount || 0,
        stages: []
      };
      
      // Nếu có chi tiết các giai đoạn, phân tích chúng
      if (item.detail && Array.isArray(item.detail)) {
        for (const stage of item.detail) {
          const sleepStage: SleepStage = {
            type: stage.type,
            startTime: stage.startTime,
            duration: stage.duration,
            heartRate: stage.heartRate
          };
          sleepData.stages.push(sleepStage);
        }
      }
      
      sleepResults.push(sleepData);
    }
  } catch (error) {
    console.error('Lỗi khi phân tích dữ liệu giấc ngủ:', error);
  }
  
  return sleepResults;
}

/**
 * Định dạng lại timestamp thành chuỗi ngày (YYYY-MM-DD)
 * @param timestamp Timestamp cần định dạng
 * @returns Chuỗi ngày theo định dạng YYYY-MM-DD
 */
export function formatDateFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Lấy tên giai đoạn giấc ngủ từ loại
 * @param type Loại giai đoạn giấc ngủ
 * @returns Tên giai đoạn giấc ngủ
 */
export function getSleepStageName(type: number): string {
  switch (type) {
    case SLEEP_TYPE.DEEP_SLEEP:
      return 'Ngủ sâu';
    case SLEEP_TYPE.LIGHT_SLEEP:
      return 'Ngủ nhẹ';
    case SLEEP_TYPE.REM:
      return 'REM';
    case SLEEP_TYPE.AWAKE:
      return 'Thức giấc';
    case SLEEP_TYPE.NAPS:
      return 'Ngủ trưa';
    default:
      return 'Không xác định';
  }
}

/**
 * Chuyển đổi số giây thành chuỗi thời gian định dạng "HH:MM"
 * @param seconds Số giây
 * @returns Chuỗi thời gian định dạng "HH:MM"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Lấy màu cho từng loại giai đoạn giấc ngủ
 * @param type Loại giai đoạn giấc ngủ
 * @returns Mã màu
 */
export function getSleepStageColor(type: number): string {
  switch (type) {
    case SLEEP_TYPE.DEEP_SLEEP:
      return '#3F51B5'; // Xanh đậm
    case SLEEP_TYPE.LIGHT_SLEEP:
      return '#7986CB'; // Xanh nhạt
    case SLEEP_TYPE.REM:
      return '#E91E63'; // Hồng
    case SLEEP_TYPE.AWAKE:
      return '#FF9800'; // Cam
    case SLEEP_TYPE.NAPS:
      return '#4CAF50'; // Xanh lá
    default:
      return '#9E9E9E'; // Xám
  }
}

/**
 * Tính chất lượng giấc ngủ dựa trên tỷ lệ giấc ngủ sâu và tổng thời gian ngủ
 * @param sleepData Dữ liệu giấc ngủ
 * @returns Tỷ lệ chất lượng giấc ngủ (0-100)
 */
export function calculateSleepQuality(sleepData: SleepData): number {
  // Tổng thời gian ngủ (không tính thời gian thức giấc)
  const totalSleepTime = sleepData.deepSleepTotal + sleepData.lightSleepTotal + sleepData.remSleepTotal;
  
  // Nếu tổng thời gian ngủ quá ít (ít hơn 2 giờ), chất lượng kém
  if (totalSleepTime < 7200) {
    return 20;
  }
  
  // Tỷ lệ giấc ngủ sâu và REM
  const deepAndRemRatio = (sleepData.deepSleepTotal + sleepData.remSleepTotal) / totalSleepTime;
  
  // Tỷ lệ lý tưởng: 20-25% ngủ sâu và 20-25% REM
  let quality = 0;
  
  // Đánh giá dựa trên tổng thời gian ngủ
  if (totalSleepTime >= 25200) { // 7+ giờ
    quality += 40;
  } else if (totalSleepTime >= 21600) { // 6+ giờ
    quality += 35;
  } else if (totalSleepTime >= 18000) { // 5+ giờ
    quality += 25;
  } else {
    quality += 15;
  }
  
  // Đánh giá dựa trên tỷ lệ ngủ sâu và REM
  if (deepAndRemRatio >= 0.4) {
    quality += 40;
  } else if (deepAndRemRatio >= 0.3) {
    quality += 35;
  } else if (deepAndRemRatio >= 0.2) {
    quality += 25;
  } else {
    quality += 15;
  }
  
  // Đánh giá dựa trên số lần thức giấc
  if (sleepData.wakeCount <= 1) {
    quality += 20;
  } else if (sleepData.wakeCount <= 3) {
    quality += 15;
  } else if (sleepData.wakeCount <= 5) {
    quality += 10;
  } else {
    quality += 5;
  }
  
  return Math.min(100, quality);
}

/**
 * Lấy nhận xét về chất lượng giấc ngủ
 * @param qualityScore Điểm chất lượng (0-100)
 * @returns Nhận xét về chất lượng giấc ngủ
 */
export function getSleepQualityDescription(qualityScore: number): string {
  if (qualityScore >= 85) {
    return 'Rất tốt';
  } else if (qualityScore >= 70) {
    return 'Tốt';
  } else if (qualityScore >= 50) {
    return 'Trung bình';
  } else if (qualityScore >= 30) {
    return 'Kém';
  } else {
    return 'Rất kém';
  }
}

/**
 * Lấy đề xuất cải thiện giấc ngủ dựa trên dữ liệu giấc ngủ
 * @param sleepData Dữ liệu giấc ngủ
 * @returns Đề xuất cải thiện giấc ngủ
 */
export function getSleepRecommendations(sleepData: SleepData): string[] {
  const recommendations: string[] = [];
  const totalSleepTime = sleepData.deepSleepTotal + sleepData.lightSleepTotal + sleepData.remSleepTotal;
  
  // Đề xuất dựa trên tổng thời gian ngủ
  if (totalSleepTime < 21600) { // Ít hơn 6 giờ
    recommendations.push('Bạn nên ngủ ít nhất 7-8 giờ mỗi đêm để cơ thể được nghỉ ngơi đầy đủ.');
  }
  
  // Đề xuất dựa trên tỷ lệ giấc ngủ sâu
  if (sleepData.deepSleepTotal < totalSleepTime * 0.15) {
    recommendations.push('Giấc ngủ sâu của bạn còn thiếu. Thử tập thể dục vào buổi chiều và tránh caffeine, rượu bia trước khi ngủ.');
  }
  
  // Đề xuất dựa trên số lần thức giấc
  if (sleepData.wakeCount > 3) {
    recommendations.push('Bạn thức giấc nhiều lần trong đêm. Hãy tạo môi trường ngủ yên tĩnh, thoải mái và giữ nhiệt độ phòng ở mức 18-20°C.');
  }
  
  // Nếu thời gian thức dậy quá muộn hoặc quá sớm
  const endTime = new Date(sleepData.endTime * 1000);
  const wakeHour = endTime.getHours();
  
  if (wakeHour > 9) {
    recommendations.push('Bạn thức dậy khá muộn. Thử dậy sớm hơn để cơ thể quen với nhịp sinh học tự nhiên.');
  } else if (wakeHour < 5) {
    recommendations.push('Bạn thức dậy quá sớm. Thử đi ngủ sớm hơn để đảm bảo đủ thời gian ngủ.');
  }
  
  // Nếu không có đề xuất nào
  if (recommendations.length === 0) {
    recommendations.push('Giấc ngủ của bạn khá tốt. Hãy duy trì lịch trình ngủ hiện tại.');
  }
  
  return recommendations;
}