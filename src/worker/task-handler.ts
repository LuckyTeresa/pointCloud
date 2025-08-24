import {TaskType} from "../data-loader";
import Axios, {AxiosError, AxiosResponse} from 'axios';


export class TaskHandler {
    private _worker;

    constructor(worker) {
        this._worker = worker;
    }

    public async handleTask(context) {
        const {taskType, data} = context;
        switch (taskType) {
            case TaskType.LoadRootManifest:
                return this._loadRootManifest(data);
            case TaskType.LoadAllManifest:
                return this._loadAllManifest(data);
            case TaskType.LoadTile:
                return this._loadTile(data);
        }
    }

    private async _loadRootManifest(data) {
        const url = data.url;
        return new Promise((resolve, reject) => {
            Axios.get(url)
                .then((response: AxiosResponse) => {
                    if (response.status === 200) {
                        resolve({data: response.data});
                    } else {
                        reject(response);
                    }
                })
                .catch((error: AxiosError) => {
                    reject(error);
                });
        });
    }

    private async _loadAllManifest(data) {
        const url = data.url;
        const urns = data.urns;
        return new Promise((resolve, reject) => {
            // @ts-ignore
            Axios.post(url, JSON.stringify({'urns': urns}), {
                headers: {
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer'
            }).then(res => {
                resolve({data: res.data, transfer: res.data});
            }).catch((error: AxiosError) => {
                reject(error);
            });
        })
    }

    private async _loadTile(data) {
        const url = data.url;
        return new Promise((resolve, reject) => {
            // @ts-ignore
            Axios.get(url, {responseType: 'arraybuffer'}).then(res => {
                resolve({data: res.data, transfer: res.data});
            }).catch((error: AxiosError) => {
                reject(error);
            });
        })
    }
}