import { ycbtClientImpl } from "../core/YCBT";

const GET_DEVICE_INFO_DATA_TYPE = 512
const GET_DEVICE_INFO_DATA = new Uint8Array([71, 67])

export const handleGetDeviceInfo = () => {
    ycbtClientImpl.sendSingleData2Device(GET_DEVICE_INFO_DATA_TYPE, GET_DEVICE_INFO_DATA, 2, {
            onDataResponse: (status, data) => {
              console.log('Thông tin thiết bị:', data);
            }
          });
}