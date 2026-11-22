/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef, ChangeEvent } from 'react'
import './App.css'
import {init as initDynamsoft, initDocDetectModule} from './dynamsoft.config'
import Scanner from './components/Scanner';
import { listCameras, requestCameraPermission } from './CamUtils';

function App() {
  const initializing = useRef(false);
  const [isScanning,setIsScanning] = useState(false);
  const [initialized,setInitialized] = useState(false);
  const [cameras,setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  useEffect(()=>{
    if (initializing.current == false) {
      initializing.current = true;
      initialize();
    }
  },[])

  const initialize = async () => {
    await loadCameras();
    await initDynamsoft();
    await initDocDetectModule();
    setInitialized(true);
  }

  const toggleScanning = () => {
    setIsScanning(!isScanning);
  }

  const loadCameras = async () => {
    await requestCameraPermission();
    const camArray = await listCameras();
    setCameras(camArray);
    if (camArray.length>0) {
      setSelectedCamera(camArray[0].deviceId);
    }
  }

  const selectCamera = (e: ChangeEvent<HTMLSelectElement>) => {
    console.log(e);
    console.log(e.target.value);
    setSelectedCamera(e.target.value);
  }

  return (
    <>
      <h1>Scan to PDF</h1>
      <div>
        <label>
          Camera:
          <select 
            value={selectedCamera}
            onChange={e => selectCamera(e)}
          >
            {cameras.map((camera, i) => <option key={i} value={camera.deviceId}>{camera.label}</option>)}
          </select>
        </label>
      </div>
      {initialized && (
        <button onClick={toggleScanning}>
          {isScanning ? "Stop Scanning" : "Start Scanning"}
        </button>
      )}
      {!initialized && (
        <div>Initializing...</div>
      )}
      {isScanning&& (
        <div id="scanner">
          <Scanner cameraID={selectedCamera}></Scanner>
        </div>
      )}
      <div style={{marginTop:"2em"}}>
        Powered by <a href='https://www.dynamsoft.com' target='_blank'>Dynamsoft</a>
      </div>
    </>
  )
}

export default App
