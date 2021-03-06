'use strict';

var through = require('through');
var innersource = require('innersource');
var detective = require('detective');
var generator = require('inline-source-map');
var combine = require('combine-source-map');
var EOL = require('os').EOL;
var newlineRegex = new RegExp(EOL, 'g');

var prepend = innersource(addRequire).replace(newlineRegex, '');
var postpend = innersource(addModule).replace(newlineRegex, '');

module.exports = function(filename) {
  var buffer = '';

  return through(function(chunk) {
    buffer += chunk.toString();
  },
  function() {
    var nodeModuleRequires = getNodeModuleRequires(buffer);
    var totalPrelude = prepend + nodeModuleRequires;
    var offset = totalPrelude.split('\n').length - 0;

    var partial = totalPrelude + combine.removeComments(buffer) + ';';

    var complete = partial + postpend;

    var map = combine.create().addFile({ sourceFile: filename, source: buffer}, {line: offset});

    this.queue( complete + '\n' + map.comment());

    this.queue(null);
  });

};

function addModule(){
  var global = (function(){ return this; }).call(null);
  if(typeof __filename !== 'undefined'){
    var moduleName = __filename.slice(0, __filename.lastIndexOf('.')).replace(/\\/g, '/');
    global.require[moduleName] = module.exports;
  }
}

function addRequire(){
  var global = (function(){ return this; }).call(null);
  if(!global.require){
    global.require = function require(key){
        return global.require[key.replace(/\\/g, '/')];
    };

    (function(){
    var require = global.require;
    var ret = global.require;

    Object.defineProperty(global, 'require', {
        get: function(){
          return ret;
        },
        set: function(newRequire){
            ret = function(key){
                key = key.replace(/\\/g, '/');

                if(require[key]){
                  return require[key];
                }else if(require[key + '/index']){
                  return require[key + '/index'];
                }else{
                  var temp = ret;
                  var module;
                  ret = newRequire;
                  try {
                    module = newRequire(key);
                  }
                  catch(e){
                    ret = temp;
                    throw e;
                  }
                  ret = temp;
                  return module;
                }
            };
            for(var key in require){
              ret[key] = require[key];
            }
        }
    });

    })();
  }

}

function getNodeModuleRequires(source){
  var requires = detective(source);
  requires = requires.filter(function(require){
    return require[0] !== '.';
  });
  return requires.map(function(require){
	require = require.replace(/\\/g, '/');
    return ";var global = (function(){ return this; }).call(null);global.require['"+require+"'] = require('"+require+"');";
  }).join('');
}
