const base64url = require('base64url');
const fs = require('fs');
const url = require('url');
const NodeStaticServer = require('./node-static-server').NodeStaticServer;
/*const manifestApiPath = '/local/viewing/v3/';
const itemsApiPath = '/local/viewing/v3/items/';
const itemsBatchgetApiPath = '/local/viewing/v3/items/batchget';*/

const manifestApiPath = '/data/manifest';
const itemsApiPath = '/data/items';
const itemsBatchgetApiPath = '/batchget';
const JSZip = require('jszip');

class ViewingServer {
    constructor(root, options) {
        this.root = root;
        this.options = options;
        this.staticServer = new NodeStaticServer(root, options);
    }

    serve(request, response, postData = '') {
        const pathUrl = url.parse(request.url);
        console.log(request);
        console.log(pathUrl);
        // if (pathUrl.pathname.startsWith(itemsBatchgetApiPath)) {
        if (pathUrl.pathname.indexOf(itemsBatchgetApiPath) > 0) {
            this.serveBatchgetItem(pathUrl, request, response, postData);
        } else if (pathUrl.pathname.startsWith(itemsApiPath)) {
            this.serveItem(pathUrl, request, response);
        } else if (pathUrl.pathname.startsWith(manifestApiPath)) {
            this.serveManifest(pathUrl, request, response);
        } else {
            this.staticServer.serve(request, response);
        }
    }

    serveManifest(pathUrl, request, response) {
        const urnPath = pathUrl.pathname.replace(manifestApiPath, '');
        const pathName = base64url.decode(urnPath) + '/manifest.json';
        this.staticServer.serveFile(pathName, 200, {}, request, response);
    }

    serveItem(pathUrl, request, response) {
        const isDecode = pathUrl.search && pathUrl.search.indexOf('objectKeyEncoding=base64') !== -1;
        const itemPathName = pathUrl.pathname.replace(itemsApiPath, '');
        this.staticServer.serveFile(
            isDecode ? base64url.decode(itemPathName) : itemPathName,
            200, {}, request, response);
    }

    async serveBatchgetItem(pathUrl, request, response, postData = '') {
        // response.end(fs.readFileSync(this.staticServer.resolve('osgb/webp压缩/倾斜摄影/test.zip')));
        let urns = JSON.parse(postData).urns;
        var zip = new JSZip();
        const that = this;
        for (let index = 0; index < urns.length; index++) {
            const element = urns[index];
            const fullPath = that.staticServer.resolve(element);
            await new Promise((resolve, reject) => {
                fs.stat(fullPath, function (e, stat) {
                    if (e) {
                        console.error('SERVER.ERROR:FILE NOT EXISTS.');
                    } else if (stat.isFile()) {
                        const buffer = fs.readFileSync(fullPath);
                        zip.file(element.substring(element.lastIndexOf("/") + 1), buffer, {optimizedBinaryString: true});
                    }
                    resolve();
                });
            })
        }
        const content = await zip.generateAsync(
            {
                // nodejs 专用
                type: 'nodebuffer',
                // 压缩算法
                compression: 'DEFLATE',
                // 压缩级别
                compressionOptions: {level: 1,}
            }
        );
        response.end(content);
    }
}

exports.ViewingServer = ViewingServer;
