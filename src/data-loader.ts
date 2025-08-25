import Axios, {AxiosError, AxiosResponse} from 'axios';
import {WorkerPool} from "./worker/worker-pool";

const workerPool = new WorkerPool(4);

export enum TaskType {
    LoadRootManifest,
    LoadAllManifest,
    LoadTile
}

export class DataLoader {
    private _modelUrn: string;
    private _basePath: string;
    private _origin: string;

    constructor(modelUrn: string, origin: string = 'http://localhost:3000') {
        this._origin = origin;
        this._modelUrn = modelUrn;
        this._basePath = modelUrn + '/Piontcloud';
    }

    public async loadRootManifest() {
        const url = `${this._origin}/${this._basePath}/manifest.json`;
        /*return new Promise((resolve, reject) => {
            Axios.get(url)
                .then((response: AxiosResponse) => {
                    if (response.status === 200) {
                        resolve(response.data);
                    } else {
                        reject(response);
                    }
                })
                .catch((error: AxiosError) => {
                    reject(error);
                });
        });*/

        return new Promise((resolve, reject) => {
            const onLoad = (e) => {
                if (e) {
                    resolve(e);
                } else {
                    reject('get root manifest failed!');
                }
            };
            workerPool.addTask({
                taskType: TaskType.LoadRootManifest,
                data: {url},
            }, onLoad);
        });

    }

    public async loadAllManifestData(modelUrn: string, uriList: string[]): Promise<ArrayBuffer> {
        const urns = [];
        for (let i = 0; i < uriList.length; i++) {
            const uri = this._basePath + '/' + uriList[i];
            urns.push(uri);
        }

        const url = `${this._origin}/${this._basePath}/batchget`;

        /*// @ts-ignore
        const response = await Axios.post(url, JSON.stringify({'urns': urns}), {
            headers: {
                'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer'
        });
        return response.data;*/


        return new Promise<ArrayBuffer>((resolve, reject) => {
            const onLoad = (e: ArrayBuffer) => {
                if (e) {
                    resolve(e);
                } else {
                    reject('get root manifest failed!');
                }
            };
            workerPool.addTask({
                taskType: TaskType.LoadAllManifest,
                data: {url, urns},
            }, onLoad);
        });

    }

    public async loadTile(uri: string): Promise<ArrayBuffer> {
        const url = `${this._origin}/${this._basePath}/${uri}`;
        /*const response = await Axios.get(url, {responseType: 'arraybuffer'});
        if (response.status === 200) {
            return response.data;
        } else {
            return null;
        }*/

        return new Promise<ArrayBuffer>((resolve, reject) => {
            const onLoad = (e: ArrayBuffer) => {
                if (e) {
                    resolve(e);
                } else {
                    reject('get tile failed!');
                }
            };
            workerPool.addTask({
                taskType: TaskType.LoadTile,
                data: {url, uri},
            }, onLoad);
        });

    }
}