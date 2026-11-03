import './Modal.css';

export interface ModalProps {
  info:string;
}

const Scanner: React.FC<ModalProps> = (props:ModalProps) => {
  return (
    <>
      <div className="modal-mask"></div>
      <div className="modal">
        {props.info}
      </div>
    </>
    
  );
};

export default Scanner;
