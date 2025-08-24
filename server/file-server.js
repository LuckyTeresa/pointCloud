const http = require('http');
const fs = require('fs');
const ViewingServer = require('./viewing-server').ViewingServer;

const DEFAULT_PORT = 3000;

function main(argv) {
    const port = parseInt(argv[2]) || DEFAULT_PORT;

    let assetConfigFile;
    let redirectsFile;

    try {
        assetConfigFile = fs.readFileSync('assets.config.json', 'utf8');
    } catch (e) {
    }

    try {
        redirectsFile = fs.readFileSync('redirects.config.json', 'utf8');
    } catch (e) {
    }

    const headerConfig = assetConfigFile ? JSON.parse(assetConfigFile) : null;
    const redirects = redirectsFile ? JSON.parse(redirectsFile) : null;

    const file = new ViewingServer('../data/', {gzip: true, cache: 3600 * 168, headerConfig: headerConfig});

    function serveFile(request, response) {
        // CROS
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type', 'Authentication');
        if (request.method === 'GET') {
            request.addListener('end', function () {
                if (redirects) {
                    const redir = redirects[request.url];
                    if (redir) {
                        //console.log(request.url);
                        response.writeHead(301, {
                            Location: redir,
                        });
                        response.end();
                        return;
                    }
                }
                // Serve files!
                file.serve(request, response);
            }).resume();
        } else if (request.method === 'POST') {
            let postData = '';
            request.addListener('data', chunk => {
                // chunk是原始二进制数据，需要转化成字符串
                postData += chunk.toString();
            })
            request.addListener('end', () => {
                file.serve(request, response, postData);
            }).resume();
        } else {
            request.addListener('end', () => {
                response.end();
            }).resume();
        }
    }

    function serveError(request, response) {
        request
            .addListener('end', function () {
                response.writeHead(400, {'content-type': 'text/plain'});
                response.end();
            })
            .resume();
    }

    var server = http.createServer(serveFile);
    server.listen(port);

    console.log('Node HTTP staticServer started on port ' + port);
}

// Must be last,
main(process.argv);
