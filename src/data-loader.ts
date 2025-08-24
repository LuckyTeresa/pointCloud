import Axios, {AxiosError, AxiosResponse} from 'axios';

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

        return new Promise((resolve, reject) => {
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
        });
    }

    public async loadAllManifestData(modelUrn: string, uriList: string[]): Promise<ArrayBuffer> {
        const urns = [];
        for (let i = 0; i < uriList.length; i++) {
            const uri = this._basePath + '/' + uriList[i];
            urns.push(uri);
        }

        const url = `${this._origin}/${this._basePath}/batchget`;
        // @ts-ignore
        const response = await Axios.post(url, JSON.stringify({'urns': urns}), {
            headers: {
                'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer'
        });
        return response.data;

    }

    public async loadTile(uri: string): Promise<ArrayBuffer> {
        const url = `${this._origin}/${this._basePath}/${uri}`;
        const response = await Axios.get(url, {responseType: 'arraybuffer'});
        if (response.status === 200) {
            return response.data;
        } else {
            return null;
        }

    }
}