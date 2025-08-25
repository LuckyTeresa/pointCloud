import './style.css'
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {PCDLoader2} from "./pcd-loader2";
import {PointCloudTileset} from "./point-cloud/point-cloud-tileset";
import Stats from 'three/examples/jsm/libs/stats.module.js';


const selectBtn = document.getElementById('select');
const clearBtn = document.getElementById('clear');
const testGetBtn = document.getElementById('testGet');
const mainCanvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement;
const overlayCtx = overlayCanvas.getContext("2d");

let scene, camera, renderer, controls;
let isSelectMode = false;
let isDrawing = false;
let path = [];
let material;
let canvasTexture;
let modelMatrix;
let pointCloudTileset;
let pcTilesetArr = [];
let stats;
init();

selectBtn.addEventListener('click', startSelect);
clearBtn.addEventListener('click', clearOverlay);

// testGetBtn.addEventListener('click', test);


async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);
    // window.scene = scene;


    camera = new THREE.PerspectiveCamera(45, mainCanvas.clientWidth / mainCanvas.clientHeight, 0.01, 1000);
    camera.position.set(2, 2, 2);

    renderer = new THREE.WebGLRenderer({antialias: true, canvas: mainCanvas});
    renderer.setSize(mainCanvas.clientWidth, mainCanvas.clientHeight);
    // document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, mainCanvas);
    controls.minDistance = 0.5;
    controls.maxDistance = 300;

    overlayCanvas.addEventListener("mousedown", onMouseDown);
    overlayCanvas.addEventListener("mousemove", onMouseMove);
    overlayCanvas.addEventListener("mouseup", onMouseUp);

    canvasTexture = new THREE.CanvasTexture(overlayCanvas);

    const offsetArr = [
        new THREE.Vector3(150, 0, 0),
        new THREE.Vector3(0, 0, 60),
        new THREE.Vector3(-150, 0, 0),
        new THREE.Vector3(0, 0, -60),
        new THREE.Vector3(0, 0, 0),
    ];

    for (const offset of offsetArr) {
        pointCloudTileset = new PointCloudTileset('kitti', offset);
        pcTilesetArr.push(pointCloudTileset);
        pointCloudTileset.createMaterial(canvasTexture);
        await pointCloudTileset.loadRootManifest();
        pointCloudTileset.setCameraInfo({
            camera,
            width: mainCanvas.clientWidth,
            height: mainCanvas.clientHeight,
            pixelRatio: window.devicePixelRatio,
            fov: camera.fov * Math.PI / 180,
        })

        scene.add(pointCloudTileset.renderGroup);
    }


    const axesHelper = new THREE.AxesHelper(200);
    axesHelper.position.set(0, 0, 0);
    scene.add(axesHelper);

    stats = new Stats();
    document.getElementById('wrapper').appendChild(stats.dom);
    stats.dom.style.top = '30px';

    // window.addEventListener("resize", onWindowResize);
    animate();
}

function loadPCDFiles(fileList) {
    const loader = new PCDLoader2();
    loader.setMaterial(material);
    const group = new THREE.Group();

    let loadedCount = 0;
    fileList.forEach((file) => {
        loader.load(file, (points) => {
            // 旋转为 z-up
            points.rotation.x = -Math.PI / 2;

            group.add(points);
            loadedCount++;

            // 全部加载完成后居中并添加 AxesHelper
            if (loadedCount === fileList.length) {
                centerGroup(group);
                scene.add(group);
                modelMatrix = points.matrixWorld.clone();

                const axesHelper = new THREE.AxesHelper(200);
                axesHelper.position.copy(group.position);
                scene.add(axesHelper);

                // 调整相机位置
                const box = new THREE.Box3().setFromObject(group);
                const size = box.getSize(new THREE.Vector3()).length();
                const center = box.getCenter(new THREE.Vector3());

                controls.target.copy(center);
                camera.position.copy(center.clone().add(new THREE.Vector3(size / 2, size / 2, size / 2)));
                camera.lookAt(center);
                controls.update();
                console.log(scene);
            }
        }, undefined, undefined);
    });
}

/*loadPCDFiles([
    "public/0820/0000.pcd",
    // "models/pcd/0820/0001.pcd"
    // "models/pcd/0820/kitti_2000w.pcd"
]);*/

async function loadPointCloud() {
    const pcdTileset = new PointCloudTileset('kitti', new THREE.Vector3());
    await pcdTileset.loadRootManifest();
    pcdTileset.setCameraInfo({
        camera,
        width: mainCanvas.clientWidth,
        height: mainCanvas.clientHeight,
        pixelRatio: window.devicePixelRatio,
        fov: camera.fov,
    })
}


function startSelect() {
    controls.enabled = false;
    isSelectMode = true;
    overlayCanvas.style.pointerEvents = "auto"; // 允许接收鼠标

}




function centerGroup(group) {
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);
}

function onMouseDown(e) {
    if (!isSelectMode) return;
    isDrawing = true;
    path = [{x: e.offsetX, y: e.offsetY}];
    // drawPoint(e.offsetX, e.offsetY);
}

function onMouseMove(e) {
    if (!isSelectMode || !isDrawing) return;
    const last = path[path.length - 1];
    const point = {x: e.offsetX, y: e.offsetY};
    path.push(point);

    // 画线段
    overlayCtx.strokeStyle = "red";
    overlayCtx.lineWidth = 1;
    overlayCtx.beginPath();
    overlayCtx.moveTo(last.x, last.y);
    overlayCtx.lineTo(point.x, point.y);
    overlayCtx.stroke();
}

function onMouseUp(e) {
    if (!isSelectMode) return;
    isSelectMode = false;
    isDrawing = false;
    controls.enabled = true;

    const start = path[0];
    const end = path[path.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
        overlayCtx.beginPath();
        overlayCtx.moveTo(end.x, end.y);
        overlayCtx.lineTo(start.x, start.y);
        overlayCtx.strokeStyle = "red";
        overlayCtx.stroke();
    }
    console.log(path);
    let region = new Path2D();
    region.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        region.lineTo(path[i].x, path[i].y);
    }
    region.closePath();
    overlayCtx.fillStyle = 'red';
    // @ts-ignore
    overlayCtx.fill(region);

    overlayCanvas.style.pointerEvents = "none";
    updateTexture(true);
    overlayCanvas.style.display = 'none';
}

function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCanvas.style.display = 'block';
    updateTexture(false);
}

function updateTexture(useFlag: boolean) {
    if (canvasTexture) {
        canvasTexture.dispose();
    }
    canvasTexture = new THREE.CanvasTexture(overlayCanvas);
    for (const tileset of pcTilesetArr) {
        tileset.updateMaterial(canvasTexture, useFlag);
    }

}


function onWindowResize() {
    camera.aspect = mainCanvas.clientWidth / mainCanvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mainCanvas.clientWidth, mainCanvas.clientHeight);
    overlayCanvas.width = mainCanvas.clientWidth;
    overlayCanvas.height = mainCanvas.clientHeight;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    for (const tileset of pcTilesetArr) {
        tileset.update();
    }
    renderer.render(scene, camera);
    stats.update();
}
