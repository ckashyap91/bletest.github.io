/**
 * Bluetooth Terminal class.
 */
class BluetoothTerminal {
  /**
   * Create preconfigured Bluetooth Terminal instance.
   * @param {!(number|string)} [serviceUuid=0xFFE0] - Service UUID
   * @param {!(number|string)} [characteristicUuid=0xFFE1] - Characteristic UUID
   * @param {string} [receiveSeparator='\n'] - Receive separator
   * @param {string} [sendSeparator='\n'] - Send separator
   */
  constructor(serviceUuid = 0x0001, characteristicUuid = 0x0003,
    receiveSeparator = '\n', sendSeparator = '\n') {
    // Used private variables.
    this._receiveBuffer = ''; // Buffer containing not separated data.
    this._maxCharacteristicValueLength = 20; // Max characteristic value length.
    this._device = null; // Device object cache.
    this._characteristic = null; // Characteristic object cache.

    this._deviceId = null;
    this._rfIdNumber = null;

    // Bound functions used to add and remove appropriate event handlers.
    this._boundHandleDisconnection = this._handleDisconnection.bind(this);
    this._boundHandleCharacteristicValueChanged =
      this._handleCharacteristicValueChanged.bind(this);

    // Configure with specified parameters.
    this.setServiceUuid(serviceUuid);
    this.setCharacteristicUuid(characteristicUuid);
    this.setReceiveSeparator(receiveSeparator);
    this.setSendSeparator(sendSeparator);
  }

  /**
   * Set number or string representing service UUID used.
   * @param {!(number|string)} uuid - Service UUID
   */
  setServiceUuid(uuid) {
    this._serviceUuid = uuid;
  }

  /**
   * Set number or string representing characteristic UUID used.
   * @param {!(number|string)} uuid - Characteristic UUID
   */
  setCharacteristicUuid(uuid) {
    this._characteristicUuid = uuid;
  }

  /**
   * Set character representing separator for data coming from the connected
   * device, end of line for example.
   * @param {string} separator - Receive separator with length equal to one
   *                             character
   */
  setReceiveSeparator(separator) {
    if (!(typeof separator === 'string' || separator instanceof String)) {
      throw new Error('Separator type is not a string');
    }

    if (separator.length !== 1) {
      throw new Error('Separator length must be equal to one character');
    }

    this._receiveSeparator = separator;
  }

  /**
   * Set string representing separator for data coming to the connected
   * device, end of line for example.
   * @param {string} separator - Send separator
   */
  setSendSeparator(separator) {
    if (!(typeof separator === 'string' || separator instanceof String)) {
      throw new Error('Separator type is not a string');
    }

    if (separator.length !== 1) {
      throw new Error('Separator length must be equal to one character');
    }

    this._sendSeparator = separator;
  }

  /**
   * Launch Bluetooth device chooser and connect to the selected device.
   * @return {Promise} Promise which will be fulfilled when notifications will
   *                   be started or rejected if something went wrong
   */
  connect() {
    return this._connectToDevice(this._device);
  }

  /**
   * Disconnect from the connected device.
   */
  disconnect() {
    this._disconnectFromDevice(this._device);

    if (this._characteristic) {
      this._characteristic.removeEventListener('characteristicvaluechanged',
        this._boundHandleCharacteristicValueChanged);
      this._characteristic = null;
    }

    this._device = null;
  }

  /**
   * Data receiving handler which called whenever the new data comes from
   * the connected device, override it to handle incoming data.
   * @param {string} data - Data
   */
  receive(data) {
    // Handle incoming data.
  }

  sendNew() {
    try {
      var buffer = new ArrayBuffer(11) // array buffer for two bytes
      var newData = new Uint8Array(buffer) // views the buffer as an array of 8 bit integers
      var deviceId = 2000;
      newData[0] = 21;
      newData[1] = (deviceId & 0xFF000000) >> 24;
      newData[2] = (deviceId & 0x00FF0000) >> 16;
      newData[3] = (deviceId & 0x0000FF00) >> 8;
      newData[4] = (deviceId & 0xFF0000FF);
      newData[5] = 0;
      newData[6] = 0;
      newData[7] = 0;
      newData[8] = 0;
      newData[9] = 253;
      newData[10] = 10;
      this._log("first sending new 1");
      this._characteristic.writeValue(newData);
      //this._log("first sent new");
      //this._characteristic.writeValue( new TextEncoder().encode(newData));  
      this._log("first sent new");
    } catch (err) {
      this._log(err);
    }
  }
  /**
   * Send data to the connected device.
   * @param {string} data - Data
   * @return {Promise} Promise which will be fulfilled when data will be sent or
   *                   rejected if something went wrong
   */
  send(data) {
    // Convert data to the string using global object.
    data = String(data || '');

    // Return rejected promise immediately if data is empty.
    if (!data) {
      return Promise.reject(new Error('Data must be not empty'));
    }

    data += this._sendSeparator;

    // Split data to chunks by max characteristic value length.
    const chunks = this.constructor._splitByLength(data,
      this._maxCharacteristicValueLength);

    // Return rejected promise immediately if there is no connected device.
    if (!this._characteristic) {
      return Promise.reject(new Error('There is no connected device'));
    }

    // Write first chunk to the characteristic immediately.
    let promise = this._writeToCharacteristic(this._characteristic, chunks[0]);

    // Iterate over chunks if there are more than one of it.
    for (let i = 1; i < chunks.length; i++) {
      // Chain new promise.
      promise = promise.then(() => new Promise((resolve, reject) => {
        // Reject promise if the device has been disconnected.
        if (!this._characteristic) {
          reject(new Error('Device has been disconnected'));
        }

        // Write chunk to the characteristic and resolve the promise.
        this._writeToCharacteristic(this._characteristic, chunks[i]).
        then(resolve).
        catch(reject);
      }));
    }

    return promise;
  }

  /**
   * Get the connected device name.
   * @return {string} Device name or empty string if not connected
   */
  getDeviceName() {
    if (!this._device) {
      return '';
    }

    return this._device.name;
  }

  /**
   * Connect to device.
   * @param {Object} device
   * @return {Promise}
   * @private
   */
  _connectToDevice(device) {
    return (device ? Promise.resolve(device) : this._requestBluetoothDevice()).
    then((device) => this._connectDeviceAndCacheCharacteristic(device)).
    then((characteristic) => this._startNotifications(characteristic)).
    catch((error) => {
      this._log(error);
      return Promise.reject(error);
    });
  }

  /**
   * Disconnect from device.
   * @param {Object} device
   * @private
   */
  _disconnectFromDevice(device) {
    if (!device) {
      return;
    }

    this._log('Disconnecting from "' + device.name + '" bluetooth device...');

    device.removeEventListener('gattserverdisconnected',
      this._boundHandleDisconnection);

    if (!device.gatt.connected) {
      this._log('"' + device.name +
        '" bluetooth device is already disconnected');
      return;
    }

    device.gatt.disconnect();

    this._log('"' + device.name + '" bluetooth device disconnected');
  }

  /**
   * Request bluetooth device.
   * @return {Promise}
   * @private
   */
  _requestBluetoothDevice() {
    this._log('Requesting bluetooth device...');
    this._log('New Code with UUID 1000');
    // let optionalServices = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
    // .split(/, ?/).map(s => s.startsWith('0x') ? parseInt(s) : s)
    // .filter(s => s && BluetoothUUID.getService);

    //log('Requesting any Bluetooth Device...');
    try {
    return navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [this._serviceUuid]
    }).
    then((device) => {
      this._log('"' + device.name + '" bluetooth device selected');

      this._device = device; // Remember device.
      this._device.addEventListener('gattserverdisconnected',
        this._boundHandleDisconnection);

      return this._device;
    });
  }
  catch(ex){
    this._log(ex);
  }
  }

  /**
   * Connect device and cache characteristic.
   * @param {Object} device
   * @return {Promise}
   * @private
   */
  _connectDeviceAndCacheCharacteristic(device) {
    // Check remembered characteristic.
    if (device.gatt.connected && this._characteristic) {
      return Promise.resolve(this._characteristic);
    }

    this._log('Connecting to GATT server...');

    return device.gatt.connect().
    then((server) => {
      this._log('GATT server connected', 'Getting service...');

      return server.getPrimaryServices();
    }).
    then((services) => {
      this._log('Service found', 'Getting characteristic...');
      var ct;
      services.forEach(service => {
        ct = service.getCharacteristic(this._characteristicUuid);
      });
      return ct;
    }).
    then((characteristic) => {
      this._log('Characteristic found');

      this._characteristic = characteristic; // Remember characteristic.

      return this._characteristic;
    });
  }


  _getSupportedProperties(characteristic) {
    let supportedProperties = [];
    for (const p in characteristic.properties) {
      if (characteristic.properties[p] === true) {
        supportedProperties.push(p.toUpperCase());
      }
    }
    return '[' + supportedProperties.join(', ') + ']';
  }

  /**
   * Start notifications.
   * @param {Object} characteristic
   * @return {Promise}
   * @private
   */
  _startNotifications(characteristic) {
    this._log('Starting notifications...');
    this._log(characteristic);
    return characteristic.startNotifications().
    then(() => {
      this._log('Notifications started');

      characteristic.addEventListener('characteristicvaluechanged',
        this._boundHandleCharacteristicValueChanged);
    });
  }

  /**
   * Stop notifications.
   * @param {Object} characteristic
   * @return {Promise}
   * @private
   */
  _stopNotifications(characteristic) {
    this._log('Stopping notifications...');

    return characteristic.stopNotifications().
    then(() => {
      this._log('Notifications stopped');

      characteristic.removeEventListener('characteristicvaluechanged',
        this._boundHandleCharacteristicValueChanged);
    });
  }

  /**
   * Handle disconnection.
   * @param {Object} event
   * @private
   */
  _handleDisconnection(event) {
    const device = event.target;

    this._log('"' + device.name +
      '" bluetooth device disconnected, trying to reconnect...');

    this._connectDeviceAndCacheCharacteristic(device).
    then((characteristic) => this._startNotifications(characteristic)).
    catch((error) => this._log(error));
  }

  /**
   * Handle characteristic value changed.
   * @param {Object} event
   * @private
   */
  _handleCharacteristicValueChanged(event) {
    this._log("Data Received");
    // this._log(event.target.value.getUint8(0));
    // this._log(event.target.value.getUint8(1));
    // this._log(event.target.value.getUint8(2));
    // this._log(event.target.value.getUint8(3));
    // this._log(event.target.value.getUint8(4));
    // this._log(event.target.value.getUint8(5));
    // this._log(event.target.value.getUint8(6));
    // this._log(event.target.value.getUint8(7));
    // this._log(event.target.value.getUint8(8));
    // this._log(event.target.value.getUint8(9));
    // this._log(event.target.value.getUint8(10));
    //this._log(event.target.value.getUint8(11));
    var command = event.target.value.getUint8(0);
    var handsakeCommand = event.target.value.getUint8(9);
    var t1 = event.target.value.getUint8(1);
    var t2 = event.target.value.getUint8(2);
    var t3 = event.target.value.getUint8(3);
    var t4 = event.target.value.getUint8(4);
    var t5 = event.target.value.getUint8(5);
    var t6 = event.target.value.getUint8(6);
    var t7 = event.target.value.getUint8(7);
    var t8 = event.target.value.getUint8(8);
    var total = 0;

    if (command == 21 && handsakeCommand == 253) {
      this._log("Receive command found");     
      total = t1.toString(16) + t2.toString(16)  + t3.toString(16)  + t4.toString(16)  + t5.toString(16) + t6.toString(16) + t7.toString(16) + t8.toString(16);
      this._log("Long device id - " + total);
    }
    else
    {
      total = (t1 << 24) + (t2 << 16) + (t3 << 8) + t4;
    }

    this._connectionDataReceive(command, total, handsakeCommand);
    // let data = new DataView(event.target.value);
    // let foo = data.getUint8(0);
    // this._log(foo);
    // var i = 0
    // const value = new TextDecoder().decode(event.target.value);
    // for (const c of value) {      
    //   if (c === this._receiveSeparator) {
    //     const data = this._receiveBuffer.trim();
    //     this._receiveBuffer = '';
    //     //this._log("Data Decoded Total Data" + data);
    //     if (data) {
    //       this.receive(data);
    //     }
    //   } else {
    //     this._receiveBuffer += c;
    //   }
    // }
  }

  _connectionDataReceive(command, data, handsakeCommand) {

    if (handsakeCommand != 253) {
      return;
    }
    if (command == 21) {
      this._deviceId = data;
      var deviceFound = true;
      this._log('21 Receive'+ data);
      if (deviceFound) {
        this._sendToDevice(command, 1);
        this._log('21 Send 1');
      } else {
        this._sendToDevice(command, 0);
        this._log('21 Send 0');
      }
    } else if (command == 31) {
      this._rfIdNumber = data;
      this._log('RFID Number', data);
      if (!this.checkRFIDExists()) {
        this._log('RFID Number exists');
        this._sendToDevice(command, 0);
      }
    } else if (command == 41) {
      //Tap Number 1-Left 2-Right
      this._sendToDevice(command, 1);
    } else if (command == 42) {
      //Volume of Tap in ml
      var t = 2 * 1000;
      this._sendToDevice(command, t);
    } else if (command == 43) {
      //Beer price in cent
      var price = 1 * 100;
      this._sendToDevice(command, price);
    } else if (command == 44) {
      //User Amount in cent
      var at = 10 * 100;
      this._sendToDevice(command, at);
    } else if (command == 32) {
      //Finish Pouring
      //var lastAmount = data;
      this._log('Finish Pouring Due to :' + command);
    } else if (command == 33) {
      //Finish Pouring
      //var lastAmount = data;
      this._log('Finish Pouring Due to :' + command);
    } else if (command == 34) {
      //Finish Pouring
      //var lastAmount = data;
      this._log('Finish Pouring Due to :' + command);
    } else if (command == 35) {
      //Finish Pouring
      //var lastAmount = data;
      this._log('Finish Pouring Due to :' + command);
    } else if (command == 36) {
      //Finish Pouring
      var lastAmount1 = data;
      this._log('Start Pouring Continue' + lastAmount1);
    } else if (command == 51) {
      //Finish Pouring
      var lastAmount = data;
      this._log('Finish Pouring' + lastAmount);
    }

  }

  _tapClosed() {
    this._sendToDevice(45, 1);
  }

  _startPour() {
    this._sendToDevice(31, 1);
  }

  checkRFIDExists() {
    return true;
  }
  _sendToDevice(command, data) {
    try {
      var buffer = new ArrayBuffer(11) // array buffer for two bytes
      var newData = new Uint8Array(buffer) // views the buffer as an array of 8 bit integers
      newData[0] = command;
      newData[1] = (data & 0xFF000000) >> 24;
      newData[2] = (data & 0x00FF0000) >> 16;
      newData[3] = (data & 0x0000FF00) >> 8;
      newData[4] = (data & 0xFF0000FF);
      newData[5] = 0;
      newData[6] = 0;
      newData[7] = 0;
      newData[8] = 0;
      newData[9] = 254;
      newData[10] = 10;
      this._log("Send Data to Device for command" + command);
      this._characteristic.writeValue(newData);
      this._log("Sent Data to Device for command" + command);
    } catch (err) {
      this._log(err);
    }
  }

  /**
   * Write to characteristic.
   * @param {Object} characteristic
   * @param {string} data
   * @return {Promise}
   * @private
   */
  _writeToCharacteristic(characteristic, data) {
    return characteristic.writeValue(new TextEncoder().encode(data));
  }

  /**
   * Log.
   * @param {Array} messages
   * @private
   */
  _log(...messages) {
    console.log(...messages); // eslint-disable-line no-console
  }

  /**
   * Split by length.
   * @param {string} string
   * @param {number} length
   * @return {Array}
   * @private
   */
  static _splitByLength(string, length) {
    return string.match(new RegExp('(.|[\r\n]){1,' + length + '}', 'g'));
  }
}

// Export class as a module to support requiring.
/* istanbul ignore next */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = BluetoothTerminal;
}