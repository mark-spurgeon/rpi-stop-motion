// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const { remote } = require('electron')
const logger = require('electron').remote.require('./logger');
const { spawn } = require('child_process');

const fs = require('fs');
const path = require('path');


/* UI */
var compareState = false;

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
  })
})

Component('button-preview').addEventListener('click', (e) => {
  Component('button-preview').innerHTML='...';
  Component('button-preview').className='working';

  capturePreview(model, port, tempPath).then((resp)=> {
    logger.log(resp);
    if (resp.status==='ok') {

      const previewPath = path.join(tempPath, 'preview/')
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
      /*
        Set new images
      */
      /*if (fs.existsSync(path.join(resp.filePath, 'PreviewNext.jpg'))) {
        fs.rename(path.join(resp.filePath, 'PreviewNext.jpg'), path.join(resp.filePath, 'PreviewPrevious.jpg'), (err) => {
          if (err) throw err;
        })
      }*/
      if (!fs.existsSync(previewPath)){
        fs.mkdirSync(previewPath)
      }
      fs.rename(path.join(resp.filePath, resp.fileName), path.join(previewPath, nextImageName), (err) => {
        if (err) throw err;
      })

      //Component('PreviousImage').src = path.join(resp.filePath, previousImageName);
      Component('NextImage').src =path.join(previewPath, nextImageName);

    }
    Component('button-preview').innerHTML='Preview';
    Component('button-preview').className='';
  })
})

Component('button-capture').addEventListener('click', (e) => {
  Component('button-capture').innerHTML='...';
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
    Component('button-capture').className=''
  })
})

Component('button-compare').addEventListener('click', (e) => {
  if (compareState) {
    /* Don't compare */
    compareState=false;
    Component('PreviousImageLayout').style.display = 'none';
    Component('NextImageLayout').className="Image";
    Component('button-compare').innerHTML="Enable Previous Image";

  } else {
    /* Compare */
    compareState=true;
    Component('PreviousImageLayout').style.display = 'block';
    Component('NextImageLayout').className="Image Overlay";
    Component('button-compare').innerHTML="Disable Previous Image";

  }
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
function capturePreview(model, port, filepath) {
  return new Promise(function(resolve, reject) {
    const detect = spawn('gphoto2', ['--port', port,'--capture-preview'], {cwd: filepath});
    detect.stdout.on('data', (data) => {
      resolve({status:'ok', filePath:filepath, fileName:'capture_preview.jpg'});
    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
      //logger.log(`child process exited with code ${code}`);
    });
  });
}
function captureImage(model, port, filepath, filename) {
  return new Promise(function(resolve, reject) {
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
        setTimeout( () => {
          resolve({status:'ok', filePath:filepath, fileName:filename});
        },
        4500)

      }


    });
    detect.stderr.on('data', (error) => {
      logger.log(`error: ${error}`);
    });
    detect.on('close', (code) => {
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
