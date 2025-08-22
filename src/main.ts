import './style.css'
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {PCDLoader2} from "./pcd-loader2";


const selectBtn = document.getElementById('select');
const clearBtn = document.getElementById('clear');
const mainCanvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement;
const overlayCtx = overlayCanvas.getContext("2d");

let scene, camera, renderer, controls;
let isSelectMode = false;
let isDrawing = false;
let path = [];
let material;
// window.path = path;
let canvasTexture;
init();


function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);
    // window.scene = scene;


    camera = new THREE.PerspectiveCamera(60, mainCanvas.clientWidth / mainCanvas.clientHeight, 0.01, 1000);
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

    material = new THREE.RawShaderMaterial({

        uniforms: {
            size: {value: 0.005},
            map: {value: canvasTexture},
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
    console.log(material);
    window.addEventListener("resize", onWindowResize);
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
            }
        }, undefined, undefined);
    });
}

loadPCDFiles([
    "public/0820/0000.pcd",
    // "models/pcd/0820/0001.pcd"
    // "models/pcd/0820/kitti_2000w.pcd"
]);


function startSelect() {
    controls.enabled = false;
    isSelectMode = true;
    overlayCanvas.style.pointerEvents = "auto"; // 允许接收鼠标
    console.log("进入套索模式");

}

selectBtn.addEventListener('click', startSelect);
clearBtn.addEventListener('click', clearOverlay);


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
    updateTexture();
    overlayCanvas.style.display = 'none';
}

function clearOverlay() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayCanvas.style.display = 'block';
    updateTexture();
}

function updateTexture() {
    if (canvasTexture) {
        canvasTexture.dispose();
    }
    canvasTexture = new THREE.CanvasTexture(overlayCanvas);
    material.uniforms.map.value = canvasTexture;
    material.needsUpdate = true;

}

function drawPoint(x, y) {
    overlayCtx.fillStyle = "red";
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 2, 0, Math.PI * 2);
    overlayCtx.fill();
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
    renderer.render(scene, camera);
}
