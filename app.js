const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const cors = require('cors');
const app = express();
const port = 20220;
const soap = require('soap');

/**
 * get client soap
 * @param {*} accessToken 
 * @param {*} SOAPUrl 
 * @param {*} serverHost
 * @returns 
 */
async function getClientSoap(accessToken, SOAPUrl, serverHost) {
    console.log("getClientSoap:::", accessToken, SOAPUrl, serverHost)
    let client = null;
    try {
        const options = {
            wsdl_headers: {
                "Authorization": "Bearer " + accessToken
            }
        }
        const urlClient = `${serverHost}/wsdlDynamic?SOAPUrl=${SOAPUrl}&access_token=${accessToken}`;
        client = await soap.createClientAsync(urlClient, options)
    } catch (error) {
        console.error('error::WSDL::', error)
    }

    return client;
}

/**
 * to get Oauth2
 * @param {*} config 
 * @returns 
 */
const getOauth2 = async (config) => {
    const tokenURL = `https://login.microsoftonline.com/${config.tenant}/oauth2/V2.0/token`;
    const data = new FormData();
    data.append('client_id', config.client_id);
    data.append('client_secret', config.client_secret);
    data.append('grant_type', config.grant_type);
    data.append('scope', config.scope);
    data.append('tenant', config.tenant);
    const configurationAxios = {
        method: 'post',
        maxBodyLength: Infinity,
        url: tokenURL,
        headers: {
            ...data.getHeaders()
        },
        data
    };
    return await axios.request(configurationAxios);
}

 /**
 * To get Request/WSDL from the selected URL
 * @param {*} url 
 * @param {*} accessToken 
 * @returns 
 */
 const getRequestDynamic = async (url, accessToken) => {
    const Authorization = `Bearer ${accessToken}`
    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url,
        headers: {
            Authorization
        }
    };
    return await axios.request(config);
}

app.use(cors({
    origin: '*'
}));

app.use(express.json())

app.listen(port, () => {
    console.log(`Server listening at the port: ${port}`);
});

app.get('/', (req, res) => {
    res.json({ 'status': 'ok' });
});

/**
 * get Oauth2 and the xml of web Services to pass to mini-Server
 */
app.post('/odatav4/company', (req, res) => {
    const config = req.body;
    console.log("/odatav4/company::start", config)
    getOauth2(config)
        .then(async (response) => {
            const url = `${config.baseUrl}/${config.tenant}/${config.environment}/ODataV4/Company(\'${config.company}\')/${config.append}`
            if (!response?.data?.access_token) return res.json({ status: 401, reason: 'access token not exist' });
            const responseSoap = await getRequestDynamic(url, response?.data?.access_token);
            res.json(responseSoap.data);
        })
        .catch((e) => {
            console.error('error:::wrapperoauth2::', e)
            res.json({ 'status': "ko" });
        });
});

/**
 *  Oatuh2 -> wsdl of xml
 */
app.get('/wsdlDynamic', (req, res) => {
    const access_token = req.query.access_token;
    const url = req.query.SOAPUrl;
    if (!access_token) return res.json({ status: 401, reason: 'access token not exist' });
    getRequestDynamic(url, access_token)
    .then((responseMethod) => {
        res.set('Content-Type', 'text/xml');
        res.send(responseMethod.data)
    })
    .catch((err) => console.error(err));
})

/**
 * pass to the mini server the Methods and the respective parameters of the web services list
 */
app.post('/methods', (req, res) => {
    const config = req.body;
    console.log("/methods:start", config)
    getOauth2(config)
        .then(async (response) => {
            const url = config.SOAPUrl;
            const methodName = config.methodName;
            const serverHost = config.server;
            if (!url || !methodName) return console.warn('missed url / methodName')
            if (!response?.data?.access_token) return res.json({ status: 401, reason: 'access token not exist' });
            try {
                //get client and describe and format array, response to front-end 
                const client = await getClientSoap(response.data.access_token, url, serverHost);
                var methodNameJustify = methodName.replace(/\. |\s/g, "_");
                //regex for names which includes '.' or ' ' -> '_'
                let soapURLName = url.includes('/Page/') ? methodNameJustify + '_Service' : methodNameJustify;
                const clientDescribe = client.describe();
                const methodsList = clientDescribe[soapURLName][methodNameJustify + '_Port']
                const parameterMapping = {};
                for (const functionName in methodsList) {
                    if (Object.hasOwnProperty.call(methodsList, functionName)) {
                        const functionParams = methodsList[functionName].input;
                        parameterMapping[functionName] = functionParams;
                    }
                }
                res.json(parameterMapping);
            } catch (error) {
                console.error(error);
                res.json({ status: 500, error });
            }
        })
        .catch((e) => {
            console.error('error:::methods', e)
        });
});