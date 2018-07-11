"use strict";

var assert = require('assert');
var net = require('net');
var StatsD = require('../').StatsD;

/**
 * Since sampling uses random, we need to patch Math.random() to always give
 * a consistent result
 */
Math.random = function () {
  return 0.42;
};

function createServer(onListening) {
  // This is the actual TCP server implementation of etsy/statsd
  // Including the metrics handler which splits the TCP packet on "\n"
  // to deal with multiple metrics in a single TCP stream data flush
  var server = net.createServer(function (socket) {
    socket.setEncoding('ascii');

    var buffer = '';
    socket.on('data', function (data) {
      buffer += data;
      var offset = buffer.lastIndexOf("\n");
      if (offset > -1) {
        var packet = buffer.slice(0, offset + 1);
        buffer = buffer.slice(offset + 1);

        var parts;
        if (packet.indexOf("\n") > -1) {
          parts = packet.split("\n");
        } else {
          parts = [packet];
        }

        var metrics = parts.filter(part => part !== '');

        server.emit('metrics', metrics);
      }
    });
  });

  server.on('listening', function () {
    onListening(server.address());
  });

  server.listen(0, '127.0.0.1');
  
  return server;
}

describe('StatsD [TCP]', function () {
  var server;
  var statsd;

  afterEach(function () {
    // Remove it from the namespace to not fail other tests
    delete global.statsd;
    statsd = null;
  });

  describe('#init', function () {
    it('should create a socket variable that is an instance of net.Socket if set to TCP', function () {
      createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        assert.ok(statsd.socket instanceof net.Socket);
        done();
      }).close();
    });
  });

  describe('#globalTags', function () {
    it('should not add global tags if they are not specified', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.increment('test');
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:1|c');
        server.close();
        done();
      });
    });

    it('should add global tags if they are specified', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          global_tags: ['gtag'],
          protocol: 'tcp'
        });
        statsd.increment('test');
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:1|c|#gtag');
        server.close();
        done();
      });
    });

    it('should combine global tags and metric tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          global_tags: ['gtag'],
          protocol: 'tcp'
        });
        statsd.increment('test', 1337, ['foo']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:1337|c|#foo,gtag');
        server.close();
        done();
      });
    });
  });

  describe('#timing', function () {
    it('should send proper time format without prefix, suffix, sampling and callback', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.timing('test', 42);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|ms');
        server.close();
        done();
      });
    });

    it('should send proper time format with tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.timing('test', 42, ['foo', 'bar']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|ms|#foo,bar');
        server.close();
        done();
      });
    });

    it('should send proper time format with prefix, suffix, sampling and callback', function (done) {
      var called = false;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });
        statsd.timing('test', 42, 0.5, function () {
          called = true;
        });
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'foo.test.bar:42|ms|@0.5');
        assert.equal(called, true);
        server.close();
        done();
      });
    });

    it('should properly send a and b with the same value', function (done) {
      var called = false;
      var messageNumber = 0;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.timing(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // Ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
      server.on('metrics', function (metrics) {
        if (messageNumber === 0) {
          assert.equal(metrics, 'a:42|ms');
          messageNumber += 1;
        } else {
          assert.equal(metrics, 'b:42|ms');
          server.close();
          done();
        }
      });
    });
  });

  describe('#histogram', function () {
    it('should send proper histogram format without prefix, suffix, sampling and callback', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.histogram('test', 42);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|h');
        server.close();
        done();
      });
    });

    it('should send proper histogram format with tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.histogram('test', 42, ['foo', 'bar']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|h|#foo,bar');
        server.close();
        done();
      });
    });

    it('should send proper histogram format with prefix, suffix, sampling and callback', function (done) {
      var called = false;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });
        statsd.histogram('test', 42, 0.5, function () {
          called = true;
        });
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'foo.test.bar:42|h|@0.5');
        assert.equal(called, true);
        server.close();
        done();
      });
    });

    it('should properly send a and b with the same value', function (done) {
      var called = 0;
      var messageNumber = 0;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.histogram(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // Ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
      server.on('metrics', function (metrics) {
        if (messageNumber === 0) {
          assert.equal(metrics, 'a:42|h');
          messageNumber += 1;
        } else {
          assert.equal(metrics, 'b:42|h');
          server.close();
          done();
        }
      });
    });
  });

  describe('#gauge', function () {
    it('should send proper gauge format without prefix, suffix, sampling and callback', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.gauge('test', 42);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|g');
        server.close();
        done();
      });
    });

    it('should send proper gauge format with tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.gauge('test', 42, ['foo', 'bar']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|g|#foo,bar');
        server.close();
        done();
      });
    });

    it('should send proper gauge format with prefix, suffix, sampling and callback', function (done) {
      var called = false;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });
        statsd.gauge('test', 42, 0.5, function () {
          called = true;
        });
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'foo.test.bar:42|g|@0.5');
        assert.equal(called, true);
        server.close();
        done();
      });
    });

    it('should properly send a and b with the same value', function (done) {
      var called = 0;
      var messageNumber = 0;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.gauge(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // Ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
      server.on('metrics', function (metrics) {
        if (messageNumber === 0) {
          assert.equal(metrics, 'a:42|g');
          messageNumber += 1;
        } else {
          assert.equal(metrics, 'b:42|g');
          server.close();
          done();
        }
      });
    });
  });

  describe('#increment', function () {
    it('should send count by 1 when no params are specified', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.increment('test', 42);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|c');
        server.close();
        done();
      });
    });

    it('should send proper count format with tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.increment('test', 42, ['foo', 'bar']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|c|#foo,bar');
        server.close();
        done();
      });
    });

    it('should send proper gauge format with prefix, suffix, sampling and callback', function (done) {
      var called = false;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });
        statsd.increment('test', 42, 0.5, function () {
          called = true;
        });
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'foo.test.bar:42|c|@0.5');
        assert.equal(called, true);
        server.close();
        done();
      });
    });

    it('should properly send a and b with the same value', function (done) {
      var called = 0;
      var messageNumber = 0;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.increment(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // Ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
      server.on('metrics', function (metrics) {
        if (messageNumber === 0) {
          assert.equal(metrics, 'a:42|c');
          messageNumber += 1;
        } else {
          assert.equal(metrics, 'b:42|c');
          server.close();
          done();
        }
      });
    });
  });

  describe('#decrement', function () {
    it('should send count by 1 when no params are specified', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.decrement('test', 42);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:-42|c');
        server.close();
        done();
      });
    });

    it('should send proper count format with tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.decrement('test', 42, ['foo', 'bar']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:-42|c|#foo,bar');
        server.close();
        done();
      });
    });

    it('should send proper gauge format with prefix, suffix, sampling and callback', function (done) {
      var called = false;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });
        statsd.decrement('test', 42, 0.5, function () {
          called = true;
        });
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'foo.test.bar:-42|c|@0.5');
        assert.equal(called, true);
        server.close();
        done();
      });
    });

    it('should properly send a and b with the same value', function (done) {
      var called = 0;
      var messageNumber = 0;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.decrement(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // Ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
      server.on('metrics', function (metrics) {
        if (messageNumber === 0) {
          assert.equal(metrics, 'a:-42|c');
          messageNumber += 1;
        } else {
          assert.equal(metrics, 'b:-42|c');
          server.close();
          done();
        }
      });
    });
  });

  describe('#set', function () {
    it('should send count by 1 when no params are specified', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.set('test', 42);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|s');
        server.close();
        done();
      });
    });

    it('should send proper count format with tags', function (done) {
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.set('test', 42, ['foo', 'bar']);
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'test:42|s|#foo,bar');
        server.close();
        done();
      });
    });

    it('should send proper gauge format with prefix, suffix, sampling and callback', function (done) {
      var called = false;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          prefix: 'foo.', 
          suffix: '.bar',
          protocol: 'tcp'
        });
        statsd.set('test', 42, 0.5, function () {
          called = true;
        });
      });
      server.on('metrics', function (metrics) {
        assert.equal(metrics, 'foo.test.bar:42|s|@0.5');
        assert.equal(called, true);
        server.close();
        done();
      });
    });

    it('should properly send a and b with the same value', function (done) {
      var called = 0;
      var messageNumber = 0;
      server = createServer(function (address) {
        statsd = new StatsD({
          host: address.address, 
          port: address.port,
          protocol: 'tcp'
        });
        statsd.set(['a', 'b'], 42, null, function (error, bytes) {
          called += 1;
          assert.ok(called === 1); // Ensure it only gets called once
          assert.equal(error, null);
          assert.equal(bytes, 0);
        });
      });
      server.on('metrics', function (metrics) {
        if (messageNumber === 0) {
          assert.equal(metrics, 'a:42|s');
          messageNumber += 1;
        } else {
          assert.equal(metrics, 'b:42|s');
          server.close();
          done();
        }
      });
    });
  });
}.bind(null, StatsD));
