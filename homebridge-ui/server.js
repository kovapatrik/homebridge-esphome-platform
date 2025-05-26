import { createRequire } from 'node:module';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { defaultConfig, defaultDeviceConfig } from '../dist/platformUtils.js';
const require = createRequire(import.meta.url);

class UiServer extends HomebridgePluginUiServer {
  config;

  constructor() {
    super();
    // Obtain the plugin configuration from homebridge config JSON file.
    const config = require(this.homebridgeConfigPath).platforms.find((obj) => obj.platform === 'esphome-platform');

    this.onRequest('/mergeToDefault', async ({ config }) => {
      _.defaultsDeep(config, defaultConfig);
      for (const device of config.devices) {
        _.defaultsDeep(device, defaultDeviceConfig);
      }
      this.config = config;
      this.logger.setDebugEnabled(config.uiDebug ? config.uiDebug : false);
      this.logger.debug(`Merged config:\n${JSON.stringify(config, null, 2)}`);
      return config;
    });

    this.onRequest('/getDefaults', async () => {
      return {
        defaultConfig,
        defaultDeviceConfig,
      };
    });

    this.onRequest('/discover', async ({ ip }) => {
      try {
        const devices = await this.blockingDiscover(ip);
        for (const device of devices) {
          if (device.version === ProtocolVersion.V3 && this.cloud.loggedIn) {
            await this.getNewCredentials(device);
          } else {
            device.token = '';
            device.key = '';
          }
        }
        this.logger.debug(`All devices:\n${JSON.stringify(devices, null, 2)}`);
        return devices.filter((a) => Object.keys(a).length > 0).sort((a, b) => a.ip.localeCompare(b.ip));
      } catch (e) {
        const msg = e instanceof Error ? e.stack : e;
        throw new RequestError(`Device discovery failed:\n${msg}`);
      }
    });

    this.onRequest('/downloadLua', async ({ deviceType, deviceSn }) => {
      try {
        if (!this.smartHomeCloud) {
          const username = Buffer.from((DEFAULT_SMARTHOME_ACCOUNT[0] ^ DEFAULT_SMARTHOME_ACCOUNT[1]).toString(16), 'hex').toString('ascii');
          const password = Buffer.from((DEFAULT_SMARTHOME_ACCOUNT[0] ^ DEFAULT_SMARTHOME_ACCOUNT[2]).toString(16), 'hex').toString('ascii');
          this.smartHomeCloud = CloudFactory.createCloud(username, password, 'Midea SmartHome (MSmartHome)');
        }
        if (!this.smartHomeCloud.loggedIn) {
          await this.smartHomeCloud.login();
        }
        const lua = await this.smartHomeCloud.getProtocolLua(deviceType, deviceSn);
        return lua;
      } catch (e) {
        const msg = e instanceof Error ? e.stack : e;
        throw new RequestError(`Download Lua failed:\n${msg}`);
      }
    });

    // inform client-side script that we are ready to receive requests.
    this.ready();
  }

  /*********************************************************************
   * getNewCredentials
   * Obtains token/key credentials and saves them in device object.
   */
  async getNewCredentials(device) {
    let connected = false;
    let i = 0;
    this.logger.info(`[${device.name}] Retrieve credentials.`);
    // Need to make two passes to obtain token/key credentials as they may work or not
    // depending on byte order (little or big-endian).  Exit the loop as soon as one
    // works or having tried both.
    while (i <= 1 && !connected) {
      // Start with big-endianess as it is more likely to succeed.
      const endianess = i === 0 ? Endianness.Little : Endianness.Big;
      try {
        const [token, key] = await this.cloud.getTokenKey(device.id, endianess);
        device.token = token ? token.toString('hex') : undefined;
        device.key = key ? key.toString('hex') : undefined;
        await this.authenticate(device);
        connected = true;
      } catch (e) {
        //const msg = e instanceof Error ? e.stack : e;
        this.logger.debug(`[${device.name}] Getting token and key with ${endianess}-endian is not successful.\n${e}`);
        // if failed then reset token/key
        device.token = undefined;
        device.key = undefined;
      }
      i++;
    }
    this.logger.debug(`[${device.name}] Token: ${device.token}, Key: ${device.key}`);
    return;
  }

  /*********************************************************************
   * authenticate
   * authenticate the token/key pair with the device to check that it works.
   */
  async authenticate(device) {
    if (!(device.token && device.key)) {
      throw new Error(`[${device.name}] Token or key is missing!`);
    }
    await this.promiseSocket.connect(device.port, device.ip);
    // Wrap next block in try/finally so we can destroy the socket if error occurs
    // let thrown errors cascade up.
    try {
      const request = this.security.encode_8370(Buffer.from(device.token, 'hex'), TCPMessageType.HANDSHAKE_REQUEST);
      await this.promiseSocket.write(request);
      const response = await this.promiseSocket.read();
      if (response) {
        if (response.length < 20) {
          this.logger.debug(
            `[${device.name}] Authenticate error when receiving data from ${device.ip}:${device.port}. (Data length: ${
              response.length
            })\n${JSON.stringify(response)}`,
          );
          throw Error(`[${device.name}] Authenticate error when receiving data from ${device.ip}:${device.port}. (Data length mismatch)`);
        }
        const resp = response.subarray(8, 72);
        this.security.tcp_key_from_resp(resp, Buffer.from(device.key, 'hex'));
      } else {
        throw Error(`[${device.name}] Authenticate error when receiving data from ${device.ip}:${device.port}.`);
      }
    } finally {
      this.promiseSocket.destroy();
    }
  }

  /*********************************************************************
   * blockingDiscover
   * broadcast to network(s) to discover new devices, obtain credentials
   * for each as discovered.
   */
  async blockingDiscover(ipAddrs = undefined) {
    const devices = [];
    this.logger.debug(`[blockingDiscover] IP addresses: ${JSON.stringify(ipAddrs)}`);
    const discover = new Discover(this.logger);
    return new Promise((resolve, reject) => {
      this.logger.info('Start device discovery...');
      this.pushEvent('showToast', {
        success: true,
        msg: 'Start device discovery',
      });
      // If IP addresses provided then probe them directly
      if (ipAddrs && ipAddrs.length > 0) {
        for (const ip of ipAddrs) {
          discover.discoverDeviceByIP(ip);
        }
      }
      // And then send broadcast to network(s)
      discover.startDiscover();

      discover.on('device', async (device) => {
        device.displayName = DeviceTypeToName[device.type] ?? 'Unknown';
        devices.push(device);
        // too verbose to post every device as found...
        // this.pushEvent('showToast', { success: true, msg: `Discovered ${device.name} at ${device.ip}`, device: device });
      });

      discover.on('retry', (nTry, nDevices) => {
        this.logger.info('Device discovery complete.');
        this.pushEvent('showToast', {
          success: true,
          msg: `Continuing to search for devices (${nDevices} found)`,
        });
      });

      discover.on('complete', () => {
        this.logger.info('Device discovery complete.');
        this.pushEvent('showToast', {
          success: true,
          msg: 'Discovery complete',
        });
        resolve(devices);
      });
    });
  }
}

// start the instance of the class
(() => {
  return new UiServer();
})();
