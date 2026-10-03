import { WebWorkerMLCEngineHandler } from "https://esm.run/@mlc-ai/web-llm@0.2.82";

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = function(event){
  handler.onmessage(event);
};