function readBatteryLevel() {
    var $target = document.getElementById('target');
    
    if (!('bluetooth' in navigator)) {
      $target.innerText = 'Bluetooth API not supported.';
      return;
    }
    
    navigator.bluetooth.requestDevice({
        filters: [{
          services: ['battery_service']
        }]
      })
      .then(function (device) {
        return device.gatt.connect();
      })
      .then(function (server) {
        return server.getPrimaryService('battery_service');
      })
      .then(function (service) {
        return service.getCharacteristic('battery_level');
      })
      .then(function (characteristic) {
        characteristic.writeValue(new TextEncoder().encode('Hi Hello'));
        return characteristic.readValue();
      })
      .then(function (value) {
        $target.innerHTML = 'Battery percentage is <b>' + value.getUint8(0) + '</b>.';
      })
      .catch(function (error) {
        $target.innerText = error;
      });
  }