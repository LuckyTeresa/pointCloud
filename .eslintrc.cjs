import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: ["dist"], // 忽略构建输出
    },
    js.configs.recommended, // JS 推荐规则
    ...tseslint.configs.recommended, // TS 推荐规则
];