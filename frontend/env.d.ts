interface ImportMetaEnv {
    readonly VITE_API_GATEWAY_ID: string
    readonly VITE_AWS_REGION: string
    readonly VITE_ENVIRONMENT:string
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}