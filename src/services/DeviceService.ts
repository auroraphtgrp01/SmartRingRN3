import { ycbtClientImpl } from "../core/YCBT";

const GET_DEVICE_INFO_DATA_TYPE = 512
const GET_DEVICE_INFO_DATA = new Uint8Array([71, 67])

export const handleGetDeviceInfo = () => {
    const sendDeviceInfoRequest = () => {
        ycbtClientImpl.sendSingleData2Device(GET_DEVICE_INFO_DATA_TYPE, GET_DEVICE_INFO_DATA, 2, {
            onDataResponse: (status, data: any) => {
                console.log('Thông tin thiết bị:', data);
                
                if (data && data.length === 7) {
                    console.log('Độ dài dữ liệu = 7, gọi lại yêu cầu...');
                    sendDeviceInfoRequest();
                }
            }
        });
    };
    
    sendDeviceInfoRequest();
}