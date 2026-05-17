function createAppData() {
  return {
    // ── Config ────────────────────────────────────────────────────────────────
    pin: '',
    savedPin: '',
    serviceMap: {},

    // ── HAP Discovery ─────────────────────────────────────────────────────────
    showServiceMapping: false,
    showEsphomeDiscovery: false,
    hapEnabled: false,
    discoveredServices: [],
    discoverStatus: '',
    isDiscovering: false,
    hasDiscovered: false,

    // ── Filters ───────────────────────────────────────────────────────────────
    filterText: '',
    typeFilters: [],

    // ── Per-row input state (keyed by uniqueId) ───────────────────────────────
    rowKeys: {},

    // ── Internal ──────────────────────────────────────────────────────────────
    _defaultConfig: null,
    _defaultDeviceConfig: null,

    // ── ESPHome Devices ───────────────────────────────────────────────────────
    devices: [],

    esphomeDiscovered: [],
    isDiscoveringEsphome: false,
    esphomeDiscoverStatus: '',

    // ── Device config panel ───────────────────────────────────────────────────
    configuringDevice: null,
    editingDeviceIndex: null,
    deviceForm: { serverName: '', port: 0, ip: '', psk: '', password: '', lightConfig: { coolWhite: 0, warmWhite: 0 } },
    /** UI-only — never written to config. */
    authMode: 'none',
    /** UI-only — never written to config. */
    useStaticIp: false,
    deviceEntities: [],
    deviceInfo: null,
    isLoadingEntities: false,
    excludedKeys: [],
    mainEntityKey: null,

    // ── Computed ──────────────────────────────────────────────────────────────
    get filteredServices() {
      const hidden = new Set(this.typeFilters.filter((f) => !f.visible).map((f) => f.type));
      const text = this.filterText.toLowerCase();
      return this.discoveredServices
        .filter((s) => {
          if (hidden.has(s.humanType ?? s.type ?? 'Unknown')) return false;
          if (text && !(s.serviceName ?? '').toLowerCase().includes(text)) return false;
          return true;
        })
        .sort((a, b) => (a.serviceName ?? '').localeCompare(b.serviceName ?? ''));
    },

    get noResultsMessage() {
      return this.discoveredServices.length ? 'No services match the current filter.' : 'No services found.';
    },

    get pinEmpty() {
      return !this.pin.trim();
    },
    get pinChanged() {
      return this.pin.trim() !== this.savedPin;
    },
    get serviceMappingEntries() {
      return Object.entries(this.serviceMap);
    },

    get hasLightEntities() {
      return this.deviceEntities.some((e) => e.kind === 'Light');
    },

    // ── Init ──────────────────────────────────────────────────────────────────
    async init() {
      homebridge.showSpinner();

      const { defaultConfig, defaultDeviceConfig } = await homebridge.request('/getDefaults');
      this._defaultConfig = defaultConfig;
      this._defaultDeviceConfig = defaultDeviceConfig;

      const pluginConfig = await homebridge.getPluginConfig();
      const configSchema = await homebridge.getPluginConfigSchema();
      const configuration = pluginConfig.length ? pluginConfig[0] : {};

      this.devices = (configuration?.devices ?? []).slice();
      this.hapEnabled = configuration?.homebridgeEvents?.enabled ?? false;
      this.serviceMap = { ...(configuration?.homebridgeEvents?.serviceMap ?? {}) };
      this.pin = configuration?.homebridgeEvents?.pin ?? '';
      this.savedPin = this.pin;

      this._createForm(configSchema, configuration);

      homebridge.hideSpinner();
    },

    // ── Schema form ───────────────────────────────────────────────────────────
    _createForm(schema, config) {
      const form = homebridge.createForm(schema, config);
      form.onChange(async (changes) => {
        changes = this._filterOutDefaults(changes, this._defaultConfig);
        // homebridgeEvents and devices are fully managed by the custom UI
        const hap = {
          ...(this.hapEnabled && { enabled: true }),
          ...(this.pin && { pin: this.pin }),
          ...(Object.keys(this.serviceMap).length && { serviceMap: Alpine.raw(this.serviceMap) }),
        };
        if (Object.keys(hap).length) changes['homebridgeEvents'] = hap;
        else delete changes['homebridgeEvents'];
        changes['devices'] = Alpine.raw(this.devices);
        await homebridge.updatePluginConfig([changes]);
      });
    },

    _filterOutDefaults(object, defaults) {
      const deleteEmptyObjects = (obj) => {
        for (const [k, v] of Object.entries(obj)) {
          if (!v || typeof v !== 'object' || v === null) continue;
          deleteEmptyObjects(v);
          if (Object.keys(v).length === 0) delete obj[k];
        }
        return obj;
      };
      const result = {};
      for (const [k, v] of Object.entries(object)) {
        if (k === 'devices') {
          result[k] = v.map((d) => this._filterOutDefaults(d, this._defaultDeviceConfig));
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          result[k] = this._filterOutDefaults(v, defaults?.[k] ?? {});
        } else if (typeof defaults === 'object' && defaults !== null && k in defaults && v === defaults[k]) {
          // matches default — omit
        } else {
          result[k] = v;
        }
      }
      return deleteEmptyObjects(result);
    },

    // ── HAP Discovery ─────────────────────────────────────────────────────────
    async discover() {
      if (this.pinEmpty) {
        homebridge.toast.error('Please enter a Homebridge PIN.');
        return;
      }
      if (this.pinChanged) {
        await this._persistPin(this.pin.trim());
        this.savedPin = this.pin.trim();
      }

      this.isDiscovering = true;
      this.discoverStatus = 'Discovering…';
      this.hasDiscovered = false;
      homebridge.showSpinner();

      try {
        const services = await homebridge.request('/discoverHapServices', { pin: this.pin });
        this.discoveredServices = services ?? [];

        // Build type filter list — Protocol Information hidden by default
        const types = [...new Set(this.discoveredServices.map((s) => s.humanType ?? s.type ?? 'Unknown'))].sort();
        this.typeFilters = types.map((type) => ({ type, visible: type !== 'Protocol Information' }));

        // Initialise per-row key inputs from current mappings
        this.rowKeys = {};
        for (const s of this.discoveredServices) {
          this.rowKeys[s.nameBasedUniqueId] = this.serviceMap[s.nameBasedUniqueId] ?? '';
        }

        const n = this.discoveredServices.length;
        this.discoverStatus = `Found ${n} service${n !== 1 ? 's' : ''}.`;
        this.hasDiscovered = true;
      } catch (e) {
        homebridge.toast.error(e.message || 'Discovery failed.');
        this.discoverStatus = 'Discovery failed.';
      } finally {
        this.isDiscovering = false;
        homebridge.hideSpinner();
      }
    },

    // ── Mapping helpers ───────────────────────────────────────────────────────
    isMapped(id) {
      return id in this.serviceMap;
    },

    isKeyValid(uniqueId) {
      return (this.rowKeys[uniqueId] ?? '').trim().includes('.');
    },

    keyClass(uniqueId) {
      const v = (this.rowKeys[uniqueId] ?? '').trim();
      if (!v) return 'form-control form-control-sm font-monospace';
      return `form-control form-control-sm font-monospace ${v.includes('.') ? 'key-valid' : 'key-invalid'}`;
    },

    // ── Map / Remove ──────────────────────────────────────────────────────────
    async mapService(service) {
      const key = (this.rowKeys[service.nameBasedUniqueId] ?? '').trim();

      if (Object.entries(this.serviceMap).some(([id, k]) => k === key && id !== service.nameBasedUniqueId)) {
        homebridge.toast.error(`Key "${key}" is already used.`);
        return;
      }

      this.serviceMap[service.nameBasedUniqueId] = key;

      await this._persist();
      homebridge.toast.success(`Mapped as "${key}".`);
    },

    async removeById(id) {
      this.rowKeys[id] = '';
      delete this.serviceMap[id];
      await this._persist();
      homebridge.toast.success('Mapping removed.');
    },

    // ── Persist ───────────────────────────────────────────────────────────────
    async _buildHapEvents() {
      return {
        ...(this.hapEnabled && { enabled: true }),
        ...(this.pin && { pin: this.pin }),
        ...(Object.keys(this.serviceMap).length && { serviceMap: Alpine.raw(this.serviceMap) }),
      };
    },

    async _persistPin(pin) {
      const currentConfig = (await homebridge.getPluginConfig())[0] ?? {};
      currentConfig['homebridgeEvents'] = { ...await this._buildHapEvents(), pin };
      await homebridge.updatePluginConfig([currentConfig]);
      await homebridge.savePluginConfig();
    },

    async _persist() {
      try {
        const currentConfig = (await homebridge.getPluginConfig())[0] ?? {};
        const hap = await this._buildHapEvents();
        if (Object.keys(hap).length) currentConfig['homebridgeEvents'] = hap;
        else delete currentConfig['homebridgeEvents'];
        await homebridge.updatePluginConfig([currentConfig]);
        await homebridge.savePluginConfig();
      } catch (e) {
        homebridge.toast.error('Failed to save configuration.');
        console.error(e);
        throw e;
      }
    },

    // ── ESPHome Device Discovery ───────────────────────────────────────────────
    async discoverEsphome() {
      this.isDiscoveringEsphome = true;
      this.esphomeDiscoverStatus = 'Scanning…';
      this.esphomeDiscovered = [];
      try {
        const found = await homebridge.request('/discoverEsphomeDevices', {});
        this.esphomeDiscovered = found;
        const n = found.length;
        this.esphomeDiscoverStatus = `Found ${n} device${n !== 1 ? 's' : ''}.`;
      } catch (e) {
        homebridge.toast.error(e.message || 'Discovery failed.');
        this.esphomeDiscoverStatus = 'Discovery failed.';
      } finally {
        this.isDiscoveringEsphome = false;
      }
    },

    isConfigured(serverName) {
      return this.devices.some((d) => d.serverName === serverName);
    },

    openDeviceConfig(source = {}, deviceIndex = null) {
      this.configuringDevice = source;
      this.deviceEntities = [];
      this.deviceInfo = null;
      const def = this._defaultDeviceConfig;

      // When called from the discovered list, check if the device is already configured
      if (deviceIndex === null && source.serverName) {
        deviceIndex = this.devices.findIndex((d) => d.serverName === source.serverName);
        if (deviceIndex === -1) deviceIndex = null;
      }

      this.editingDeviceIndex = deviceIndex;

      if (deviceIndex !== null) {
        const d = this.devices[deviceIndex];
        this.deviceForm = {
          name: d.name,
          serverName: d.serverName,
          port: d.port ?? def.port,
          ip: d.ip ?? '',
          psk: d.psk ?? '',
          password: d.password ?? '',
          lightConfig: { ...def.lightConfig, ...(d.lightConfig ?? {}) },
        };
        this.authMode = d.psk ? 'psk' : d.password ? 'password' : 'none';
        this.useStaticIp = !!d.ip;
        this.excludedKeys = (d.excludedKeys ?? []).slice();
        this.mainEntityKey = d.mainEntityKey ?? null;
      } else {
        this.deviceForm = {
          name: source.friendlyName ?? '',
          serverName: source.serverName ?? '',
          port: def.port,
          ip: source.address ?? '',
          psk: '',
          password: '',
          lightConfig: { ...def.lightConfig },
        };
        this.authMode = 'none';
        this.useStaticIp = false;
        this.excludedKeys = [];
        this.mainEntityKey = null;
      }
    },

    async loadEntities() {
      this.isLoadingEntities = true;
      this.deviceEntities = [];
      this.deviceInfo = null;
      try {
        const { info, entities } = await homebridge.request('/getEsphomeEntities', {
          address: this.useStaticIp ? this.deviceForm.ip : this.deviceForm.serverName,
          port: this.deviceForm.port,
          psk: this.authMode === 'psk' ? this.deviceForm.psk : undefined,
          password: this.authMode === 'password' ? this.deviceForm.password : undefined,
        });
        this.deviceInfo = info;
        this.deviceEntities = entities;
        if (this.mainEntityKey === null && entities.length) this.mainEntityKey = entities[0].key;
      } catch (e) {
        homebridge.toast.error(e.message || 'Failed to connect to device.');
      } finally {
        this.isLoadingEntities = false;
      }
    },

    isExcluded(key) {
      return this.excludedKeys.includes(key);
    },

    toggleExcluded(key) {
      if (this.isExcluded(key)) {
        this.excludedKeys = this.excludedKeys.filter((k) => k !== key);
      } else {
        this.excludedKeys.push(key);
        if (this.mainEntityKey === key) this.mainEntityKey = null;
      }
    },

    async saveDevice() {
      if (!this.deviceForm.serverName.trim()) {
        homebridge.toast.error('Server name is required.');
        return;
      }
      if (this.mainEntityKey === null) {
        homebridge.toast.error(
          this.deviceEntities.length
            ? 'Please select a main entity.'
            : 'Please connect and load entities to set the main entity.',
        );
        return;
      }
      // Preserve lightConfig when editing without reloading entities
      const existingHasLight = this.editingDeviceIndex !== null && !!this.devices[this.editingDeviceIndex]?.lightConfig;
      const cfg = {
        serverName: this.deviceForm.serverName.trim(),
        ...(this.deviceForm.port !== this._defaultDeviceConfig.port && { port: this.deviceForm.port }),
        ...(this.useStaticIp && this.deviceForm.ip && { ip: this.deviceForm.ip }),
        ...(this.authMode === 'psk' && this.deviceForm.psk && { psk: this.deviceForm.psk }),
        ...(this.authMode === 'password' && this.deviceForm.password && { password: this.deviceForm.password }),
        mainEntityKey: this.mainEntityKey,
        ...(this.excludedKeys.length && { excludedKeys: this.excludedKeys }),
        ...((this.hasLightEntities || existingHasLight) && {
          lightConfig: {
            coolWhite: this.deviceForm.lightConfig.coolWhite,
            warmWhite: this.deviceForm.lightConfig.warmWhite,
          },
        }),
      };
      if (this.editingDeviceIndex !== null) {
        this.devices[this.editingDeviceIndex] = cfg;
      } else {
        const existingIdx = this.devices.findIndex((d) => d.serverName === cfg.serverName);
        if (existingIdx !== -1) {
          this.devices[existingIdx] = cfg;
        } else {
          this.devices.push(cfg);
        }
      }
      await this._persistDevices();
      homebridge.toast.success(this.editingDeviceIndex !== null ? 'Device updated.' : 'Device added.');
      this.configuringDevice = null;
      this.editingDeviceIndex = null;
    },

    async removeDevice(i) {
      this.devices.splice(i, 1);
      await this._persistDevices();
      homebridge.toast.success('Device removed.');
    },

    async _persistDevices() {
      const currentConfig = (await homebridge.getPluginConfig())[0] ?? {};
      currentConfig['devices'] = Alpine.raw(this.devices);
      await homebridge.updatePluginConfig([currentConfig]);
      await homebridge.savePluginConfig();
    },
  };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('app', createAppData);
});
