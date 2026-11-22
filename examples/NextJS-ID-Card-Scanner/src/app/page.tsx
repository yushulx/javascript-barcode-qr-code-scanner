'use client';
import { useEffect, useState } from "react";
import "./page.css";
import { HolderInfo } from "./components/Scanner";
import { init } from "./dcv";
import Modal from "./components/Modal";
import dynamic from "next/dynamic";

const Scanner = dynamic(() => import("./components/Scanner"), {
  ssr: false,
  loading: () => <p>Initializing ID Card Scanner</p>,
});

export default function Home() {
  const [scanning,setScanning] = useState(false);
  const [initialized,setInitialized] = useState(false);
  const [imageURL,setImageURL] = useState("");
  const [info,setInfo] = useState<HolderInfo|undefined>();
  const startScanning = () => {
    setScanning(true);
  }

  useEffect(()=>{
    const initDynamsoft = async () => {
      try {
        const result = await init();
        if (result) {
          setInitialized(true);
        }  
      } catch (error) {
        alert(error);
      }
    }
    initDynamsoft();
  },[])

  const onScanned = (blob:Blob,_info?:HolderInfo) => {
    console.log(blob);
    console.log(info);
    let url = URL.createObjectURL(blob);
    setImageURL(url);
    setInfo(_info);
    setScanning(false);
  }
  
  const onStopped = () => {
    setScanning(false);
  }

  return (
    <>
      <div className="container">
        {(imageURL && info) && (
          <div className="card">
            <div>
              Image:
              <br/>
              <img src={imageURL} alt="idcard"/>
            </div>
            <div>
              Document number:&nbsp;
              <span>{info.docNumber}</span>
            </div>
            <div>
              First name:&nbsp;
              <span>{info.firstName}</span>
            </div>
            <div>
              Last name:&nbsp;
              <span>{info.lastName}</span>
            </div>
            <div>
              Date of Birth:&nbsp;
              <span>{info.birthDate}</span>
            </div>
            <div>
              Sex:&nbsp;
              <span>{info.sex}</span>
            </div>
          </div>
        )}
        <div className="footer">
          <button className="shutter-button round" onClick={()=>{startScanning();}}>Scan</button>
        </div>
        {!initialized &&(
          <Modal info="Initializing..."></Modal>
        )}
      </div>
      {scanning && (
        <div className="fullscreen">
          <Scanner onScanned={onScanned} onStopped={onStopped}/>
        </div>
      )}
    </>
  );
}
