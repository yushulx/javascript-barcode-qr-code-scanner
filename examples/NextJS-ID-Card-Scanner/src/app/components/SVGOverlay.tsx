import React from 'react';
import { DetectedQuadResultItem } from 'dynamsoft-capture-vision-bundle'
import './SVGOverlay.css';

export interface OverlayProps {
  quad:DetectedQuadResultItem;
  viewBox:string;
}

const SVGOverlay = (props:OverlayProps): React.ReactElement => {
  const getPointsData = () => {
    let points = props.quad.location.points;
    let pointsData = points[0].x+","+ points[0].y + " ";
    pointsData = pointsData+ points[1].x +"," + points[1].y + " ";
    pointsData = pointsData+ points[2].x +"," + points[2].y + " ";
    pointsData = pointsData+ points[3].x +"," + points[3].y;
    return pointsData;
  }
  
  return (
    <svg 
      id="overlay"
      viewBox={props.viewBox}
      xmlns="<http://www.w3.org/2000/svg>">
        <polygon xmlns="<http://www.w3.org/2000/svg>"
          points={getPointsData()}
        />
    </svg>
  )
}

export default SVGOverlay;