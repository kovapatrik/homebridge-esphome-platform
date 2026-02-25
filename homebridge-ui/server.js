import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { HapClient } from '@homebridge/hap-client';
import { defaultConfig } from '../dist/platformUtils.js';

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.onRequest('/getDefaults', async () => {
      return { defaultConfig };
    });

    this.onRequest('/discoverHapServices', async ({ pin, timeout }) => {
      try {
        const hapClient = new HapClient({
          pin,
          config: { debug: false, discoveryTimeout: timeout },
          logger: this.logger,
        });

        const services = await new Promise((resolve, reject) => {
          // Fallback: if discovery-ended never fires, retrieve whatever is available
          hapClient.on('discovery-ended', async () => {
            clearTimeout(timeout);
            try {
              const allServices = await hapClient.getAllServices();
              resolve(allServices || []);
            } catch (err) {
              reject(err);
            }
          });
        });

        return services;
      } catch (e) {
        const msg = e instanceof Error ? e.stack : String(e);
        throw new RequestError(`HAP service discovery failed:\n${msg}`);
      }
    });

    this.ready();
  }
}

(() => {
  return new UiServer();
})();
