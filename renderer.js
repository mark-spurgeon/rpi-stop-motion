// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const { remote } = require('electron')
const logger = require('electron').remote.require('./logger');
const { spawn } = require('child_process');

const fs = require('fs');
const path = require('path');


/* UI */
var compareState = "next";

/* Important Variables */

var configuration = {
  'outputPath':'',
  'passepartout':'cinemascope',
  'brand':'Nikon',
  'outputExtension':'jpg'
}
var tempPath = "/temp/";
var model = null;
var port = null;
var counter = 0 //counter of number of tries

/* Events */
window.addEventListener('load', (e) => {
  /*
    Get or create config
  */
  logger.log('hey');
  const homePath = remote.app.getPath('desktop');
  tempPath = path.join(homePath, 'stop-motion-animation/');
  if (!fs.existsSync(tempPath)) {
    try {
      fs.mkdirSync(tempPath)
    } catch (e) {
      logger.log(e)
    }
  }
  /**/
  var outputpath = path.join(tempPath, 'output');
  if (fs.existsSync(outputpath)) {
    logger.log("Folder 'stop-motion-animation' already exists, please be carefull as the files might be overriden")
  } else {
    fs.mkdirSync(outputpath)
  };
  configuration.outputPath = outputpath;
  /* config */
  const configFile = path.join(tempPath, 'config.json');
  if (fs.existsSync(configFile)) {
    configuration = JSON.parse(fs.readFileSync(configFile))
  } else {
    fs.writeFileSync(configFile, JSON.stringify(configuration, null, 2))
  }

  getModel(configuration, tempPath).then( (m) => {
    Component('label-model').innerHTML = "<b>Camera:</b> "+m.model+"</br> <b>Port:</b> "+m.port;

    var count = getCount(configuration.outputPath);
    if (count>0) {
      Component('previous-frame-number').innerHTML = pad(count, 4);
      Component('next-frame-number').innerHTML = pad(count+1, 4);
    }

    getCameraConfigOptions(m.port).then( (data) => {
      console.log(data);
      if (data.status==='ok') {
        if (data.options.includes('/main/status/batterylevel')) {
          getCameraConfig(data.port,'/main/status/batterylevel').then( (d) => {
            console.log(d);
            Component('label-model').innerHTML = "<b>Camera:</b> "+m.model+"</br> <b>Port:</b> "+m.port+"</br> <b>Battery:</b> "+d.info;
          })
        }
      }
    })
  })
})

Component('button-preview').addEventListener('click', (e) => {
  Component('button-preview').innerHTML='🖖';
  Component('button-preview').className='working';

  const previewPath = path.join(tempPath, 'preview/')
  if (!fs.existsSync(previewPath)){
    fs.mkdirSync(previewPath)
  }
  /*
    Get Latest Count
  */
  var count = getCount(configuration.outputPath)+1;
  const previousImageName = pad(count,4)+"-Preview-"+counter.toString()+".jpg";
  if (fs.existsSync(path.join(previewPath, previousImageName))) {
    fs.unlinkSync(path.join(previewPath, previousImageName))
  }
  counter+=1;
  const nextImageName = pad(count,4)+"-Preview-"+counter.toString()+".jpg";

  capturePreview(model, port, previewPath, nextImageName).then((resp)=> {
    logger.log(resp);
    if (resp.status==='ok') {
      /*
        Set new images
      */
      /*if (fs.existsSync(path.join(resp.filePath, 'PreviewNext.jpg'))) {
        fs.rename(path.join(resp.filePath, 'PreviewNext.jpg'), path.join(resp.filePath, 'PreviewPrevious.jpg'), (err) => {
          if (err) throw err;
        })
      }*/
      /*fs.rename(path.join(resp.filePath, resp.fileName), path.join(previewPath, nextImageName), (err) => {
        if (err) throw err;
      })*/

      //Component('PreviousImage').src = path.join(resp.filePath, previousImageName);
      Component('NextImage').src =path.join(previewPath, 'thumb_'+nextImageName);

    }
    Component('button-preview').innerHTML='Preview';
    Component('button-preview').className='';
  })
})

Component('button-capture').addEventListener('click', (e) => {
  Component('button-capture').innerHTML='🤞';
  Component('button-capture').className='working';
  e.preventDefault();
  var largestNumber = getCount(configuration.outputPath);
  var number = largestNumber+1;
  var fileName = pad(number,4)+"."+configuration.outputExtension;
  captureImage(model, port, configuration.outputPath, fileName).then((resp) => {
    const outputFile = path.join(configuration.outputPath, fileName);
    logger.log(outputFile);
    Component('NextImage').src=outputFile;
    Component('PreviousImage').src=outputFile;

    Component('button-capture').innerHTML='Take Picture'
    Component('button-capture').className='';
    Component('previous-frame-number').innerHTML = pad(number, 4);
    Component('next-frame-number').innerHTML = pad(number+1, 4);
  })
})

Component('button-compare').addEventListener('click', (e) => {
  if (compareState==="next") {
    /* Move from next to both */
    compareState='previousnext';

    Component('PreviousImageLayout').style.display = 'block';
    Component('NextImageLayout').style.display = 'block';

    Component('PreviousImageLayout').className="Image Overlay";
    Component('NextImageLayout').className="Image Overlay";

    Component('button-compare').innerHTML="<blue>Previous</blue> + <red>Next</red> Image";

  } else if (compareState==="previousnext"){
    compareState='previous';

    Component('PreviousImageLayout').style.display = 'block';
    Component('NextImageLayout').style.display = 'none';

    Component('PreviousImageLayout').className="Image";

    Component('button-compare').innerHTML="<blue>Previous</blue> Image";
  } else if (compareState==="previous") {
    /* Compare */
    compareState='next';

    Component('PreviousImageLayout').style.display = 'none';
    Component('NextImageLayout').style.display = 'block';

    Component('NextImageLayout').className="Image";

    Component('button-compare').innerHTML="<red>Next</red> Image";
  }
})

Component('button-close-window').addEventListener('click', (e) => {
  remote.getCurrentWindow().close();
})
Component('button-devtools').addEventListener('click', (e) => {
  remote.getCurrentWindow().webContents.openDevTools();
})
Component('button-reload').addEventListener('click', (e) => {
  window.location.reload()
})
/* UI Operations */

/* Operations */
function getModel(configuration, filepath) {
  return new Promise(function(resolve, reject) {
    const detect = spawn('gphoto2', ['--auto-detect'], {cwd: filepath});
    detect.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      const modelInfo = lines[lines.length-2].replace('  ','').split('  ');
      for (var i = 0; i < modelInfo.length; i++) {
        if (modelInfo[i]!==' ') {
          if (modelInfo[i].includes(configuration.brand)) {
            model = modelInfo[i]
          }
          if (modelInfo[i].startsWith('usb')) {
            port = modelInfo[i]
          }
        }
      }

      resolve({
        model:model,
        port:port
      })
    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
      //logger.log(`child process exited with code ${code}`);
    });
  });
}
function capturePreview(model, port, filepath, filename) {
  return new Promise(function(resolve, reject) {
    var returnCode = {status:'none'}
    const detect = spawn('gphoto2', ['--port', port,'--capture-preview', '--force-overwrite', '--filename', filename], {cwd: filepath});
    detect.stdout.on('data', (data) => {
      returnCode = {status:'ok', filePath:filepath, fileName:filename};
    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
      resolve(returnCode);
      //logger.log(`child process exited with code ${code}`);
    });
  });
}
function captureImage(model, port, filepath, filename) {
  return new Promise(function(resolve, reject) {
    var returnCode = {status:'none'};
    const detect = spawn('gphoto2', ['--port', port,'--capture-image-and-download', '--force-overwrite','--filename', filename], {cwd: filepath});
    detect.stdout.on('data', (data) => {

      var d = data.toString().split('\n');

      var fileName=null;
      for (var i = 0; i < d.length; i++) {
        if (d[i].includes('Saving file as')) {
          logger.log(d[i])
          var fileName = d[i].replace('Saving file as', '')
        }
      }
      if (fileName) {
        returnCode={status:'ok', filePath:filepath, fileName:filename};
      }


    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
      setTimeout( () => {
        resolve(returnCode);
      },
      4500)
      //logger.log(`child process exited with code ${code}`);
    });
  });
}


function getCameraConfigOptions(port) {
  return new Promise(function(resolve, reject) {
    var returnCode = {
      status:'none',
      options: [],
      port:port
    }
    const detect = spawn('gphoto2', [
        '--port',
        port,
        '--list-config'
      ]
    );

    detect.stdout.on('data', (data) => {
      var options = []
      var options = data.toString().split('\n').filter(item => item.startsWith('/main/'))
      returnCode.status='ok';
      returnCode.options = options;
    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
      resolve(returnCode);
      //logger.log(`child process exited with code ${code}`);
    });
  });
}
function getCameraConfig(port, config) {
  return new Promise(function(resolve, reject) {
    var returnCode = {
      status:'none',
      options: []
    }
    const detect = spawn('gphoto2', [
        '--port',
        port,
        '--get-config',
        config
      ]
    );

    detect.stdout.on('data', (data) => {
      var info = null;
      var info = data.toString().split('\n').filter(item => item.startsWith('Current:'))[0].replace('Current:', '').trim()
      returnCode.status='ok';
      returnCode.info = info;
    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
      resolve(returnCode);
      //logger.log(`child process exited with code ${code}`);
    });
  });
}

function getCount(filepath) {
  var largestNumber = 0;
  var dir = fs.readdirSync(filepath);
  for (var i = 0; i < dir.length; i++) {
    var number = new Number(dir[i].split('.')[0]);
    if (number>largestNumber) {
      largestNumber=number;
    }
  }
  return largestNumber
}


/* Various functions */
function Component(id) {
  return document.getElementById(id)
}
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}
