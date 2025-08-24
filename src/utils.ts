import {Vector4, Vector3, Matrix4} from 'three';

export function zUp2yUp(vec: Vector3): Vector3 {
    // point
    const vec4 = new Vector4(vec.x, vec.y, vec.z, 1);
    const mat = new Matrix4().makeRotationX(-Math.PI / 2);
    vec4.applyMatrix4(mat);
    return new Vector3(vec4.x, vec4.y, vec4.z);
}