import {DataLoader} from "../data-loader";
import {PointCloudTile, TileState} from "./point-cloud-tile";
import JSZip from 'jszip';
import {ICameraInfo} from "./point-cloud-types";
import * as THREE from 'three';
import {TileFeatureTable} from "./tile-feature-table";
import {zUp2yUp} from "../utils";

const FPS_30 = 30;
const FPS_60 = 60;
const MaxScreenSpaceError = 20;

export class PointCloudTileset {
    private readonly _modelUrn: string;
    private _dataLoader: DataLoader;
    private _info: any;// 根节点manifest
    private _basePointLocationOffset: THREE.Vector3;
    private _rootList: PointCloudTile[];
    private _allTiles: PointCloudTile[];
    private _selectedTiles: PointCloudTile[];
    private _lastSelectedTiles: PointCloudTile[];
    private _cameraInfo: ICameraInfo;
    private _isInitialized: boolean;
    private _frameNumber: number;
    private _loadWaitFrameCounter: number;
    private _pntsMaterial: THREE.RawShaderMaterial;
    private _box3: THREE.Box3;
    public renderGroup: THREE.Group;

    constructor(modelUrn: string, offset: THREE.Vector3) {
        this._modelUrn = modelUrn;
        this._dataLoader = new DataLoader(modelUrn);
        this._rootList = [];
        this._allTiles = [];
        this.renderGroup = new THREE.Group();
        this.renderGroup.rotateX(-Math.PI / 2);
        this.renderGroup.applyMatrix4(new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z));
        this._isInitialized = false;
        this._frameNumber = 0;
        this._loadWaitFrameCounter = 0;
        this._lastSelectedTiles = [];

    }

    private _setHeaderInfo(): void {
        const header = this._info.root;
        const baseOffset = this._info.extensions.extensionsUsed.basePoint.location;
        // todo:根据偏移数据将模型整体移到原点处
        this._basePointLocationOffset = new THREE.Vector3(baseOffset[0], baseOffset[1], baseOffset[2]);

        if (header.boundingVolume && header.boundingVolume.box) {
            const boxCenter = zUp2yUp(new THREE.Vector3(
                header.boundingVolume.box[0],
                header.boundingVolume.box[1],
                header.boundingVolume.box[2]
            ));

            // yz轴值互换
            const halfAxes = new THREE.Vector3(
                header.boundingVolume.box[3],
                header.boundingVolume.box[11],
                header.boundingVolume.box[7],
            );

            const dir = halfAxes.clone().normalize();
            const distance = halfAxes.length();

            const max = boxCenter.clone().add(dir.clone().multiplyScalar(distance));
            const min = boxCenter.clone().add(dir.clone().multiplyScalar(-distance));

            this._box3 = new THREE.Box3(min.clone(), max.clone());

        } else {
            console.warn('根节点tile无包围盒信息');
        }
    }

    public async loadRootManifest() {
        const rootManifest = await this._dataLoader.loadRootManifest();
        this._info = rootManifest;
        this._setHeaderInfo();
        const children = rootManifest.root.children;

        if (this._isChildrenDefined(children)) {
            const childHeaders1 = [];
            for (let i = 0; i < children.length; i++) {
                const childHeader = children[i];
                childHeaders1.push(childHeader);
            }

            const tileUriMap: Map<string, PointCloudTile> = new Map();
            for (let i = 0; i < childHeaders1.length; i++) {
                const uri = childHeaders1[i] && childHeaders1[i].content.uri;
                if (uri) {
                    if (!tileUriMap.has(uri)) {
                        const root = new PointCloudTile();
                        tileUriMap.set(uri, root);
                        //_rootList 存放manifest中根节点下的children对应的json数据中的root
                        this._rootList.push(root);
                        // _allTiles中存放所有的以及子节点的tile数据
                        this._allTiles.push(root);
                    } else {
                        console.warn('skip repeat root tile.');
                    }
                }
            }

            const uris = [...tileUriMap.keys()];
            const data = await this._dataLoader.loadAllManifestData(this._modelUrn, uris);
            console.time('unzip');
            await this.unzipJsonData(data, tileUriMap);
            console.timeEnd('unzip');
            for (const root of this._rootList) {
                {
                    //根节点瓦片始终缓存不再释放，通过可见性控制是否显示，根节点最先加载出来，不管可不可见
                    this.renderGroup.add(root);
                    await this.requestContent(root);
                }
                const stack: PointCloudTile[] = [];
                stack.push(root);

                while (stack.length > 0) {
                    const tile = stack.pop();//root
                    const children2 = tile.header.children;
                    if (this._isChildrenDefined(children2)) {
                        for (let k = 0; k < children2.length; k++) {
                            const childHeader2 = children2[k];
                            if (childHeader2) {
                                childHeader2.basePointLocationOffset = this._basePointLocationOffset;
                                const childTile = new PointCloudTile();
                                childTile.setHeader(childHeader2);

                                childTile.setParent(tile);
                                tile.childrenTiles.push(childTile);
                                stack.push(childTile);
                                this._allTiles.push(childTile);
                            } else {
                                // console.log(childHeader);
                            }
                        }
                    }
                }
            }
            this._isInitialized = true;
        }


    }

    public setCameraInfo(info: ICameraInfo) {
        this._cameraInfo = info;
        // 根据rootManifest中的包围盒等信息调整相机视角
        if (this._box3) {
            const center = new THREE.Vector3();
            this._box3.getCenter(center);
            this._cameraInfo.camera.position.copy(this._box3.max);
            this._cameraInfo.camera.lookAt(center);
        }
    }

    private async requestContent(tile: PointCloudTile): Promise<void> {
        if (tile.tileState === TileState.UNLOADED) {
            tile.tileState = TileState.LOADING;
            const parseData = await this._loadPntsTile(tile) as any;
            let matrix;
            for (let i = 0; i < this._allTiles.length; i++) {
                if (this._allTiles[i].uri === tile.uri) {
                    matrix = this._allTiles[i].transform;
                }
            }

            const featureTable = new TileFeatureTable(
                parseData.featureBuffer,
                0,
                parseData.featureTableJSONByteLength,
                parseData.featureTableBinaryByteLength
            );

            const pointsLength = featureTable.getData('POINTS_LENGTH', 1);
            const posList = featureTable.getData(
                'POSITION_QUANTIZED',
                pointsLength,
                'UNSIGNED_SHORT',
                'VEC3'
            );
            const scale = featureTable.getData('QUANTIZED_VOLUME_SCALE', 1);
            const offset = featureTable.getData('QUANTIZED_VOLUME_OFFSET', 1);

            /*const min = new THREE.Vector3(Infinity, Infinity, Infinity);
            const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
            const temp = new THREE.Vector3();*/

            const newPosList = [];
            // const newColorList = [];
            // todo:实际不需要
            for (let i = 0; i < posList.length; i += 3) {

                const x = posList[i] * scale[0] / 65535.0 + offset[0];
                const y = posList[i + 1] * scale[1] / 65535.0 + offset[1];
                const z = posList[i + 2] * scale[2] / 65535.0 + offset[2];

                const newX =
                    x * matrix.elements[0] +
                    y * matrix.elements[4] +
                    z * matrix.elements[8] +
                    matrix.elements[12];
                const newY =
                    x * matrix.elements[1] +
                    y * matrix.elements[5] +
                    z * matrix.elements[9] +
                    matrix.elements[13];
                const newZ =
                    x * matrix.elements[2] +
                    y * matrix.elements[6] +
                    z * matrix.elements[10] +
                    matrix.elements[14];

                newPosList.push(newX);
                newPosList.push(newY);
                newPosList.push(newZ);

                // temp.set(x, y, z);
                // min.min(temp);
                // max.max(temp);
            }

            const tileGeometry = new THREE.BufferGeometry();
            tileGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPosList, 3));
            // 转为z-up
            // tileGeometry.rotateX(- Math.PI / 2);
            tile.setData({tileGeometry, tileMaterial: this._pntsMaterial});
            tile.requestedFrame = this._frameNumber; //记录已请求时间
        }
    }

    public update() {
        this._frameNumber++;
        this.selectTiles();
        this.requestTiles();
        this.updateTiles();
    }

    private updateTiles(): void {
        const count = this.renderGroup.children.length;
        for (const tile of this._selectedTiles) {
            if (!tile.parent) {
                this.renderGroup.add(tile);
            }
        }
        if (this.renderGroup.children.length === count) {

            for (const tile of this.renderGroup.children) {
                let ptTile = tile as PointCloudTile;
                if (!ptTile.isRootTile() && !ptTile.contentAvailable() && !ptTile.removedFrame) {
                    //renderGroup可能会出现的元素，根节点、已请求未加载完毕的、即将移除的
                    return; //存在未加载完毕的不释放
                }
            }
            //可以开始释放了
            for (const tile of this.renderGroup.children) {
                let ptTile = tile as PointCloudTile;
                if (ptTile.removedFrame !== null && ptTile.removedFrame + FPS_60 < this._frameNumber) {
                    if (ptTile.isRootTile()) {
                        ptTile.hide();
                    } else {
                        //this.updateSize(-tile.disposeMesh());
                        ptTile.disposeData();
                    }
                }
            }
        }
    }

    private selectTiles(): void {
        this._selectedTiles = [];
        this.executeBaseTraversal();
    }

    private executeBaseTraversal(): void {
        if (this._isInitialized) {
            for (let i = 0; i < this._rootList.length; i++) {
                this._updateTile(this._rootList[i]);
            }
            this._rootList.sort((a, b) => a.distanceToCamera - b.distanceToCamera);
            for (let i = 0; i < this._rootList.length; i++) {
                let rootItemHasChildLoad = {value: false};
                const tile = this._rootList[i];
                this.executeTraversal(tile, rootItemHasChildLoad);

                if (!rootItemHasChildLoad.value) {
                    tile.show();
                }
            }
        }
    }

    private executeTraversal(tile: PointCloudTile, rootItemHasChildLoad: { value: boolean }): void {
        if (!tile.isRootTile()) {
            // 根节点在executeBaseTraversal中已经更新过了
            this._updateTile(tile);
        }

        if (this._isVisible(tile)) {
            // 在视域内
            if (this._needsTraverse(tile)) {
                // 需要往下遍历
                if (tile.childrenTiles.length > 0) {
                    for (const child of tile.childrenTiles) {
                        this.executeTraversal(child, rootItemHasChildLoad);
                    }
                } else {
                    // 当前这一级需要往下遍历,但已经是子节点，就使用当前的tile数据无需释放,那么他的父节点就是不需要的数据，这里需要向上遍历移除
                    this._selectTile(tile);
                    rootItemHasChildLoad.value = true;
                }
            } else {
                // 当前tile屏幕误差满足要求
                this._selectTile(tile);
                if (!tile.isRootTile()) {
                    rootItemHasChildLoad.value = true;
                }
                this._removeChildren(tile);
            }
        } else {
            //不在视域内，移除掉，连同子节点
            this._removeTile(tile);
            this._removeChildren(tile);
        }
    }

    private requestTiles(): void {
        const sortedTiles = [];

        for (let i = 0, l = this._selectedTiles.length; i < l; i++) {
            const tile = this._selectedTiles[i];
            if (tile.contentRequested()) {
                continue;
            }
            const depth = tile.depth;

            if (sortedTiles[depth]) {
                sortedTiles[depth].push(tile);
            } else {
                sortedTiles[depth] = [tile];
            }
        }

        const temp = [];
        while (sortedTiles.length > 0) {
            const depTiles = sortedTiles.pop();
            if (depTiles) {
                depTiles.sort((a, b) => a.distanceToCamera - b.distanceToCamera);
                temp.push(...depTiles);
            }
        }

        if (temp.length > 0) {
            if (this._isNeedRequest(temp)) {
                //节流策略1：等待前后两帧计算需要加载的瓦片一致时再开始行动
                while (temp.length > 0) {
                    this.requestContent(temp.shift());
                }
            }
        }
    }

    //选中可见的tile
    private _selectTile(tile: PointCloudTile) {
        if (tile.selectedFrame !== null) {
            //选中过
            if (!tile.requestedFrame) {
                //选中但没有请求时间，说明延迟选中了，需要再次添加到列表
                this._selectedTiles.push(tile);
            } else if (this._frameNumber > tile.requestedFrame) {
                //请求帧已经过去了，说明已经渲染出来了，可以安全移除其他节点
                this._removeTileParentChildren(tile);
            }
        } else {
            //未选中过
            tile.selectedFrame = this._frameNumber;
            this._selectedTiles.push(tile);
        }
        tile.removedFrame = null; //标记不移除该瓦片
    }

    private _needsTraverse(tile: PointCloudTile): boolean {
        // tile的sse比设置的Max sse大时需要更新
        return tile.screenSpaceError > MaxScreenSpaceError;
    }

    private _isVisible(tile: PointCloudTile): boolean {
        return tile.inRequestVolume;
    }

    private _updateTile(tile: PointCloudTile): void {
        tile.updateVisibility(this._cameraInfo);
    }

    private _removeTile(tile: PointCloudTile) {
        if (tile.removedFrame === null) {
            tile.removedFrame = this._frameNumber;
        }
    }

    private _removeTileParentChildren(tile: PointCloudTile) {
        this._removeParent(tile);
        this._removeChildren(tile);
    }

    private _removeParent(tile: PointCloudTile) {
        let parent = tile.parentTile;
        while (parent != null) {
            this._removeTile(parent);
            parent = parent.parentTile; //child2->child1->root
        }
    }

    private _removeChildren(tile: PointCloudTile) {
        for (const children of tile.childrenTiles) {
            this._removeTile(children);
            for (const cc of children.childrenTiles) {
                this._removeTile(cc);
                this._removeChildren(cc);
            }
        }
    }

    private _isNeedRequest(temp: PointCloudTile[]): boolean {
        if (temp.length === this._lastSelectedTiles.length) {
            for (let i = 0, l = temp.length; i < l; i++) {
                if (temp[i] !== this._lastSelectedTiles[i]) {
                    this._lastSelectedTiles = temp;
                    this._loadWaitFrameCounter = 0;
                    return false;
                }
            }
            if (this._loadWaitFrameCounter < FPS_30) {
                this._loadWaitFrameCounter++;
                return false;
            } else {
                this._loadWaitFrameCounter = 0;
                return true;
            }
        }
        this._lastSelectedTiles = temp;
        this._loadWaitFrameCounter = 0;
        return false;
    }

    private async _loadPntsTile(tile: PointCloudTile): Promise<ArrayBuffer> {
        return await this._dataLoader.loadTile(tile.uri);
    };

    public createMaterial(canvasTexture) {
        this._pntsMaterial = new THREE.RawShaderMaterial({
            uniforms: {
                size: {value: 0.005},
                map: {value: canvasTexture},
                sModelWorldMatrix: {value: new THREE.Matrix4()},
                sViewMatrix: {value: new THREE.Matrix4()},
                sProjectionMatrix: {value: new THREE.Matrix4()},
                useFlag: {value: false}
            },
            defines: {
                IsWEBGL2: true,
            },
            glslVersion: THREE.GLSL3,
            vertexShader: document.getElementById('vertexShader').textContent,
            fragmentShader: document.getElementById('fragmentShader').textContent,
            side: THREE.DoubleSide,
            transparent: true,
        });
    }

    public updateMaterial(canvasTexture: THREE.CanvasTexture, useFlag: boolean) {
        const camera = this._cameraInfo.camera;
        const material = this._pntsMaterial;
        material.uniforms.map.value = canvasTexture;
        material.uniforms.sModelWorldMatrix.value = this.renderGroup.matrixWorld.clone();
        material.uniforms.sViewMatrix.value = camera.matrixWorldInverse.clone();
        material.uniforms.sProjectionMatrix.value = camera.projectionMatrix.clone();
        material.uniforms.useFlag.value = useFlag;
        material.needsUpdate = true;
    }

    /*private async unzipJsonData(data: ArrayBuffer, rootUriMap: Map<string, PointCloudTile>): Promise<void> {
        const zip = new JSZip();
        let count = 0;

        return new Promise<void>(async (resolve, reject) => {
            zip.loadAsync(data, {optimizedBinaryString: true}).then((res) => {
                if (Object.values(res.files).length === 0) {
                    reject();
                }
                for (let key in res.files) {
                    if (!res.files[key].dir) {
                        res.file(res.files[key].name)
                            .async('string')
                            .then((content) => {
                                const root = rootUriMap.get(key);
                                const rootHeader = JSON.parse(content).root;
                                rootHeader.basePointLocationOffset = this._basePointLocationOffset;
                                root.setHeader(rootHeader);
                                count++;
                                if (count === rootUriMap.size) {
                                    resolve();
                                }
                            });
                    }
                }
            });
        });
    }*/

    private async unzipJsonData(data: ArrayBuffer, rootUriMap: Map<string, PointCloudTile>): Promise<void> {
        const zip = new JSZip();
        let count = 0;

        try {
            const res = await zip.loadAsync(data, {optimizedBinaryString: true});
            if (Object.values(res.files).length === 0) {
                throw new Error('no data!');
            }

            const promises = Object.keys(res.files).map(async (key) => {
                if (!res.files[key].dir) {
                    try {
                        const content = await res.file(res.files[key].name).async('string');
                        const root = rootUriMap.get(key);
                        if (root) {
                            const rootHeader = JSON.parse(content).root;
                            rootHeader.basePointLocationOffset = this._basePointLocationOffset;
                            root.setHeader(rootHeader);
                            count++;
                            if (count === rootUriMap.size) {
                                return true;
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing file: ${key}`, error);
                    }
                }
            });

            await Promise.all(promises);

            if (count === rootUriMap.size) {
                return;
            } else {
                throw new Error('Not all files were processed');
            }
        } catch (error) {
            console.error('Error unzipping or processing JSON data:', error);
            throw error;
        }
    }

    private _isChildrenDefined(value: any): boolean {
        return value !== undefined && value !== null;
    }


}