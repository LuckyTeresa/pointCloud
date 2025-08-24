import * as THREE from 'three';
import {ICameraInfo} from "./point-cloud-types";

export enum TileState {
    UNLOADED,
    LOADING,
    READY,
    HIDE,
}

const _matrix = new THREE.Matrix4();

export class PointCloudTile extends THREE.Points {
    public header: any;
    public tileState: TileState;
    public transform: THREE.Matrix4;
    public _requestedFrame: number;
    public _selectedFrame: number;
    public _removedFrame: number;
    private _box3: THREE.Box3;
    private _removeLater: boolean;
    private _boundingVolumeCenter: THREE.Vector3;
    public uri: string;
    public parentTile: PointCloudTile;
    public childrenTiles: PointCloudTile[];
    public depth: number;
    public geometricError: number;
    public screenSpaceError: number;
    public distanceToCamera: number;
    public inRequestVolume: boolean;
    private _boundingLimtHigh: THREE.Vector3;
    private _boundingLimtLow: THREE.Vector3;

    public requestedFrame: number;
    public selectedFrame: number;
    public removedFrame: number;

    constructor() {
        super();
        this.depth = 0;
        this.transform = new THREE.Matrix4();
        this.childrenTiles = [];
        this.tileState = TileState.UNLOADED;
        this._resetStatus();
    }

    public setHeader(header: any): void {
        this.header = header;

        //this.tileSize = this.header.extensions.memorySize;
        if (this.header.content) {
            this.uri = this.header.content.uri;
            this.geometricError = parseFloat(this.header.geometricError);
        }
        if (this.header.transform) {
            if (this.depth === 0) {
                this.transform.fromArray(this.header.transform);
            } else {
                this.transform.multiply(new THREE.Matrix4().fromArray(this.header.transform));
            }
        }

        this._getBoundingInfo();
        this._box3 = new THREE.Box3();
        const boxArr = this.header.boundingVolume.box;

        this._box3.max = new THREE.Vector3(
            this._boundingVolumeCenter.x + boxArr[3],
            this._boundingVolumeCenter.y + boxArr[7],
            this._boundingVolumeCenter.z + boxArr[11]
        );
        this._box3.min = new THREE.Vector3(
            this._boundingVolumeCenter.x - boxArr[3],
            this._boundingVolumeCenter.y - boxArr[7],
            this._boundingVolumeCenter.z - boxArr[11]
        );
        this._box3.applyMatrix4(this.transform);
    }

    public setParent(tile: PointCloudTile): void {
        this.depth = tile.depth + 1;
        this.parentTile = tile;
        this.transform.premultiply(this.parentTile.transform);
    }

    public setData(data): void {
        if (this._removeLater) {
            this._removeLater = false;
            return;
        }
        this.geometry = data.tileGeometry;
        this.material = data.tileMaterial;

        this.name = this.depth.toString();
        this.tileState = TileState.READY;
    }

    public updateVisibility(cInfo: ICameraInfo): void {
        this.inRequestVolume = this._boxInRequestVolume(cInfo);
        if (this.inRequestVolume) {
            //在视野内再计算这些值
            this.distanceToCamera = this._distanceToTile(cInfo);
            this.screenSpaceError = this._getScreenSpaceError(cInfo);
        }
    }

    public isRootTile(): boolean {
        return this.parentTile === undefined || this.parentTile === null;
    }

    public contentAvailable(): boolean {
        return this.tileState === TileState.READY;
    }

    public contentUnloaded(): boolean {
        return this.tileState === TileState.UNLOADED;
    }

    public contentRequested(): boolean {
        return (
            this.tileState === TileState.READY ||
            this.tileState === TileState.LOADING ||
            this.tileState === TileState.HIDE
        );
    }

    public contentIsLoading(): boolean {
        return this.tileState === TileState.LOADING;
    }

    public hide() {
        this.tileState = TileState.HIDE;
        this.visible = false;
    }

    public disposeData(): void {
        this._resetStatus();
        if (this.contentIsLoading()) {
            this._removeLater = true; //如果是正在加载，则延迟销毁
        }
        this.removeFromParent();
        this.geometry.dispose();
        (this.material as THREE.MeshBasicMaterial).map.dispose();
        (this.material as THREE.MeshBasicMaterial).dispose();

        this.geometry = null;
        // this.geometry = new THREE.BufferGeometry();
        // this.material = new THREE.ShaderMaterial();
        this.tileState = TileState.UNLOADED;
    }

    public show() {
        this.tileState = TileState.READY;
        this.visible = true;
    }

    private _getBoundingInfo(): void {
        if (this.header.boundingVolume && this.header.boundingVolume.box) {
            const box = this.header.boundingVolume;
            this._boundingVolumeCenter = new THREE.Vector3(box[0], box[1], box[2]);
            const halfAxes = new THREE.Vector3(box[3], box[7], box[11]);

            const dir = halfAxes.clone().normalize();
            const distance = halfAxes.length();
            this._boundingLimtHigh = this._boundingVolumeCenter.clone().add(dir.clone().multiplyScalar(distance));
            this._boundingLimtLow = this._boundingVolumeCenter.clone().add(dir.clone().multiplyScalar(-distance));
        } else {
            console.warn('tile 无包围盒信息');
        }
    }

    private _boxInRequestVolume(cInfo: ICameraInfo): boolean {
        let contains = false;
        const camera = cInfo.camera;
        camera.updateMatrixWorld(true);
        _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const frustum = new THREE.Frustum();
        frustum.setFromProjectionMatrix(_matrix);

        if (frustum.intersectsBox(this._box3)) {
            contains = true;
        }
        return contains;
    }

    private _getScreenSpaceError(cInfo: ICameraInfo): number {
        const heightFraction = 1.0;
        if (this.geometricError === 0.0) {
            // Leaf tiles do not have any error so save the computation
            return 0.0;
        }

        //const width = cInfo.width;
        const height = cInfo.height * heightFraction;
        let error;

        // Avoid divide by zero when viewer is inside the tile
        const distance = Math.max(this.distanceToCamera, 0.0000001);
        const sseDenominator = 2.0 * Math.tan(0.5 * cInfo.fov);
        error = (this.geometricError * height) / (distance * sseDenominator);
        error /= cInfo.pixelRatio;
        return error;
    }

    private _distanceToTile(cInfo: ICameraInfo): number {
        const dis = this._boundingVolumeCenter.clone().sub(cInfo.camera.position).length();
        return dis;
    }

    private _resetStatus() {
        //必须重置状态
        this.requestedFrame = null;
        this.selectedFrame = null;
        this.removedFrame = null;
    }
}