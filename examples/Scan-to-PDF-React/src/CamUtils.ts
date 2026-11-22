export async function requestCameraPermission() {
  try {
    const constraints = {video: true, audio: false};
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    closeStream(stream);
  } catch (error) {
    console.log(error);
    throw error;
  }
}

export function closeStream(stream:MediaStream){
  if (stream) {
    const tracks = stream.getTracks();
    for (let i=0;i<tracks.length;i++) {
      const track = tracks[i];
      track.stop();  // stop the opened tracks
    }
  }
}

export async function listCameras(){
  const cameras:MediaDeviceInfo[] = [];
  const allDevices:MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();
  for (let i = 0; i < allDevices.length; i++){
    const device:MediaDeviceInfo = allDevices[i];
    if (device.kind == 'videoinput'){
      cameras.push(device);
    }
  }
  return cameras;
}