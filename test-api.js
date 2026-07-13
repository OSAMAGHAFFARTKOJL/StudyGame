
const http = require('http');

const postData = JSON.stringify({
  text: "The human nervous system controls body activities through electrical and chemical signals. Neurons receive information through dendrites, process it in the cell body, and send impulses through axons. Synapses allow neurons to communicate by releasing neurotransmitters. The brain interprets sensory information, controls movement, stores memories, and regulates emotions. The spinal cord carries messages between the brain and the body and helps produce quick reflex actions.",
  title: "Nervous System Test"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/study',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response body:');
    console.log(data);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
