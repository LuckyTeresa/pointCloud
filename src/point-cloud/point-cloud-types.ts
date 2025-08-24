import * as THREE from 'three';

export interface ICameraInfo {
    camera: THREE.Camera,
    width: number,
    height: number,
    pixelRatio: number,
    fov: number,
}

export interface IVector3 {
    x: number;
    y: number;
    z: number;
}

export interface ICamera {
    isPerspective: boolean;
    position: IVector3;
    target: IVector3;
    up: IVector3;
    aspect: number;
    fov: number;
    scale: number;
}