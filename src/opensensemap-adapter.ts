/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Adapter, Device, Property } from 'gateway-addon';

import fetch from 'node-fetch';

interface LastMeasurement {
  value: string;
}

interface Sensor {
  _id: string;
  lastMeasurement: LastMeasurement;
  title: string;
  unit: string;
}

interface SenseBox {
  _id: string;
  name: string;
  sensors: Sensor[];
}

interface Config {
  boxIds: string[]
}

const SCHEMA_UNITS: { [key: string]: string } = {
  '°C': 'degree celsius',
  '%': 'percent',
  'µg/m³': 'micrograms per cubic metre',
  'hPa': 'hectopascal',
  'V': 'volt'
};

const PROPERTY_TYPE_BY_UNIT: { [key: string]: string } = {
  '°C': 'TemperatureProperty',
  'µg/m³': 'DensityProperty',
  'hPa': 'BarometricPressureProperty',
  'V': 'VoltageProperty'
};

const DEVICE_CAPABILITIES: { [key: string]: string } = {
  TemperatureProperty: 'TemperatureSensor',
  BarometricPressureProperty: 'BarometricPressureSensor'
};

class OpenSenseBox extends Device {
  constructor(adapter: any, manifest: any, private boxId: string) {
    super(adapter, `opensensebox-${boxId}`);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this.name = `${OpenSenseBox.name} (${boxId})`;
    this.description = manifest.description;
    this.links = [
      {
        rel: 'alternate',
        mediaType: 'text/html',
        href: `https://opensensemap.org/explore/${boxId}`
      }
    ];
  }

  async init() {
    const senseBox = await this.getData();
    const deviceCapabilities: string[] = [];

    for (const sensor of senseBox.sensors) {
      const id = sensor._id;
      let unit = sensor.unit;
      if (SCHEMA_UNITS.hasOwnProperty(unit)) {
        unit = SCHEMA_UNITS[unit];
      }
      let schemaType;
      if (PROPERTY_TYPE_BY_UNIT.hasOwnProperty(sensor.unit)) {
        schemaType = PROPERTY_TYPE_BY_UNIT[sensor.unit];
        if (DEVICE_CAPABILITIES.hasOwnProperty(schemaType)) {
          const capability = DEVICE_CAPABILITIES[schemaType];
          if (!deviceCapabilities.includes(capability)) {
            deviceCapabilities.push(capability);
          }
        }
      }

      const property = new Property(this, id, {
        '@type': schemaType,
        type: 'number',
        title: sensor.title,
        unit,
        readOnly: true
      });

      this.properties.set(id, property);
    }

    this.name = senseBox.name;
    this['@type'] = deviceCapabilities;
  }

  public startPolling(seconds: number) {
    setInterval(() => this.poll(), seconds * 1000);
    this.poll();
  }

  async poll() {
    const senseBox = await this.getData();

    for (const sensor of senseBox.sensors) {
      const id = sensor._id;
      const property = this.properties.get(id);

      if (property) {
        if (sensor.lastMeasurement && sensor.lastMeasurement.value) {
          const numberValue = Number.parseFloat(sensor.lastMeasurement.value);
          property.setCachedValueAndNotify(numberValue);
        }
      } else {
        console.warn(`Could not find property for sensor ${id}`);
      }
    }
  }

  async getData() {
    const url = `https://api.opensensemap.org/boxes/${this.boxId}`;
    const result = await fetch(url);
    return <SenseBox>await result.json();
  }
}

export class OpenSenseMapAdapter extends Adapter {
  constructor(addonManager: any, private manifest: any) {
    super(addonManager, OpenSenseMapAdapter.name, manifest.name);
    addonManager.addAdapter(this);
    this.createDevices();
  }

  async createDevices() {
    const {
      boxIds
    } = <Config>this.manifest.moziot.config;

    if (boxIds) {
      for (const boxId of boxIds) {
        console.log(`Creating OpenSenseBox for ${boxId}`);
        const opensensebox = new OpenSenseBox(this, this.manifest, boxId);
        await opensensebox.init();
        this.handleDeviceAdded(opensensebox);
        opensensebox.startPolling(60);
      }
    }
  }
}
