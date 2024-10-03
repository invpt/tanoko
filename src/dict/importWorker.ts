import { runImport } from "./db";

(async () => {
  try {
    const n = await runImport((n) => {
      self.postMessage({ status: "loading", items: n });
    });
    self.postMessage({ status: "success", items: n });
  } catch (error) {
    self.postMessage({ status: "failure", error });
  }
})();
