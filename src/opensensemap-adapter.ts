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
}

interface SenseBox {
  _id: string;
  sensors: Sensor[];
}

interface Config {
  boxIds: string[]
}

class OpenSenseBox extends Device {
  constructor(adapter: any, manifest: any, private boxId: string) {
    super(adapter, `opensensebox-${boxId}`);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this.name = `${OpenSenseBox.name} (${boxId})`;
    this.description = manifest.description;
  }

  async init() {
    const senseBox = await this.getData();

    for (const sensor of senseBox.sensors) {
      const id = sensor._id;

      const property = new Property(this, id, {
        type: 'number',
        title: sensor.title,
        readOnly: true
      });

      this.properties.set(id, property);
    }
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
          property.setCachedValue(sensor.lastMeasurement.value);
          this.notifyPropertyChanged(property);
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

export class GoogleHomeAdapter extends Adapter {
  constructor(addonManager: any, private manifest: any) {
    super(addonManager, GoogleHomeAdapter.name, manifest.name);
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
