<div class="intro">

<img src="/assets/captcha-api-docs/img/cloudflare.svg" width="320" height="160" alt="Turnstile widget" />

<h1>Cloudflare Turnstile</h1>

</div>

Token-based method to bypass Cloudflare Turnstile. Both the standalone captcha and challenge mode are supported.


There are two different cases that require different approach:
- **Standalone Captcha** - the captcha widget is placed on a webiste page, see [our demo](/demo/cloudflare-turnstile)
- **Cloudflare Challenge page** - the captcha is shown on Cloudflare Challenge page


## Standalone Captcha
To bypass a standalone captcha you just need to find the `sitekey`, get a token from our API and then pass it to your target as a value of input element with name `cf-turnstile-response` or `g-recaptcha-response` for reCAPTCHA compatibility mode. Also the token can be processed with a callback function passed to `turnstile.render` call.


## Cloudflare Challenge page
This is much more complex case. You should intercept the `turnstile.render` call and grab the following values:
- `cData`
- `chlPageData`
- `action`

Also you will need to intercept the callback definition and use the userAgent returned from our API.

To intercept the required parameters you can inject the following JavaScript on page before the Turnstile widget is loaded.

```js
const i = setInterval(()=>{
if (window.turnstile) {
    clearInterval(i)
    window.turnstile.render = (a,b) => {
    let p = {
        type: "TurnstileTaskProxyless",
        websiteKey: b.sitekey,
        websiteURL: window.location.href,
        data: b.cData,
        pagedata: b.chlPageData,
        action: b.action,
        userAgent: navigator.userAgent
    }
    console.log(JSON.stringify(p))
    window.tsCallback = b.callback
    return 'foo'
    }
}
},10)  
```

An another approach is to intercept the request to `api.js` script and replace it with your own script that returns the parameters and makes the callback acessible globally.

Finally when you received the solution:
* execute the callback passing the token as it's argument
 

## Task types
- **TurnstileTaskProxyless** - we use our own pool of proxies
- **TurnstileTask** - we use your proxies

## TurnstileTaskProxyless task type specification

| Property          | Type      | Required | Description |
| ----------------- | --------- | -------- | ----------- |
| **type**          | *String*  | **Yes**  | Task type: <br>**TurnstileTaskProxyless** <br>  **TurnstileTask** |
| **websiteURL**    | *String*  | **Yes**  | The full URL of target web page where the captcha is loaded. We do not open the page, not a problem if it is available only for authenticated users       |
| **websiteKey**    | *String*  | **Yes**  | Turnstile sitekey. Can be found inside `data-sitekey` property of the Turnstile `div` element |
| action            | *String*  | No*      | Required for Cloudflare Challenge pages. The value of `action` parameter of `turnstile.render` call |
| data              | *String*  | No*      | Required for Cloudflare Challenge pages. The value of `cData` parameter of `turnstile.render` call |
| pagedata          | *String*  | No*      | Required for Cloudflare Challenge pages. The value of `chlPageData` parameter of `turnstile.render` call |


## TurnstileTask task type specification

`TurnstileTask` extends `TurnstileTaskProxyless` adding a set of proxy-related parameters listed below

| Property         | Type      | Required | Description                                              |
| ---------------- | --------- | -------- | -------------------------------------------------------- |
| **proxyType**    | *String*  | **Yes**  | Proxy type: <br>**http** <br> **socks4** <br> **socks5** |
| **proxyAddress** | *String*  | **Yes**  | Proxy IP address or hostname                             |
| **proxyPort**    | *Integer* | **Yes**  | Proxy port                                               |
| proxyLogin       | *String*  | No       | Login for basic authentication on the proxy              |
| proxyPassword    | *String*  | No       | Password for basic authentication on the proxy           |


## Request examples

Method: [createTask](/api-docs/create-task)
API endpoint: `https://api.2captcha.com/createTask`

### Standalone Captcha

#### TurnstileTaskProxyless request example

```json
{
    "clientKey":"YOUR_API_KEY",
    "task": {
        "type":"TurnstileTaskProxyless",
        "websiteURL":"https://2captcha.com/demo/cloudflare-turnstile",
        "websiteKey":"3x00000000000000000000FF"
    }
}
```


#### TurnstileTask request example

```json
{
    "clientKey":"YOUR_API_KEY",
    "task": {
        "type":"TurnstileTask",
        "websiteURL":"https://2captcha.com/demo/cloudflare-turnstile",
        "websiteKey":"3x00000000000000000000FF",
        "proxyType":"http",
        "proxyAddress":"1.2.3.4",
        "proxyPort":"8080",
        "proxyLogin":"user23",
        "proxyPassword":"p4$w0rd"
    }
}
```

### Cloudflare Challenge Pages

#### TurnstileTaskProxyless request example

```json
{
    "clientKey":"YOUR_API_KEY",
    "task": {
        "type":"TurnstileTaskProxyless",
        "websiteURL":"https://2captcha.com/demo/cloudflare-turnstile",
        "websiteKey":"3x00000000000000000000FF",
        "action": "managed",
        "data": "80001aa1affffc21",
        "pagedata": "3gAFo2l...55NDFPRFE9"
    }
}
```


#### TurnstileTask request example

```json
{
    "clientKey":"YOUR_API_KEY",
    "task": {
        "type":"TurnstileTask",
        "websiteURL":"https://2captcha.com/demo/cloudflare-turnstile",
        "websiteKey":"3x00000000000000000000FF",
        "action": "managed",
        "data": "80001aa1affffc21",
        "pagedata": "3gAFo2l...55NDFPRFE9",
        "proxyType":"http",
        "proxyAddress":"1.2.3.4",
        "proxyPort":"8080",
        "proxyLogin":"user23",
        "proxyPassword":"p4$w0rd"
    }
}
```


### Response example

Method: [getTaskResult](/api-docs/get-task-result)
API endpoint: `https://api.2captcha.com/getTaskResult`

```json
{
    "errorId": 0,
    "status": "ready",
    "solution": {
        "token": "0.zrSnRHO7h0HwSjSCU8oyzbjEtD8p.d62306d4ee00c77dda697f959ebbd7bd97",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    },
    "cost": "0.00145",
    "ip": "1.2.3.4",
    "createTime": 1692863536,
    "endTime": 1692863556,
    "solveCount": 1
}
```

## Code examples

<div class="code-example" data-component="Tabs">
  <ul data-component="TabList">
  <li role="presentation">
  <a href="#php-code-example"  data-component="Tab">
  <img class="code-example-icon" src="/assets/captcha-recognition/icons/php.svg" alt="" loading="lazy" />
  PHP
  </a>
  </li>
  <li role="presentation">
  <a href="#python-code-example"  data-component="Tab">
  <img class="code-example-icon" src="/assets/captcha-recognition/icons/python.svg" alt="" loading="lazy"/>
  Python
  </a>
  </li>
  <li role="presentation">
  <a href="#ruby-code-example"  data-component="Tab">
  <img class="code-example-icon" src="/assets/captcha-recognition/icons/ruby.svg" alt="" loading="lazy"/>
  Ruby
  </a>
  </li>
  </ul>
  <div id="php-code-example" data-component="TabPanel">

  ```php
  // https://github.com/2captcha/2captcha-php

  require(__DIR__ . '/../src/autoloader.php');

  $solver = new \TwoCaptcha\TwoCaptcha('YOUR_API_KEY');

  try {
      $result = $solver->turnstile([
          'sitekey' => '3x00000000000000000000FF',
          'url'     => 'https://2captcha.com/demo/cloudflare-turnstile',
      ]);
  } catch (\Exception $e) {
      die($e->getMessage());
  }
  ```
  </div>

  <div id="python-code-example" data-component="TabPanel">

  ```python
  # https://github.com/2captcha/2captcha-python

  import sys
  import os

  sys.path.append(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

  from twocaptcha import TwoCaptcha

  api_key = os.getenv('APIKEY_2CAPTCHA', 'YOUR_API_KEY')

  solver = TwoCaptcha(api_key)

  try:
      result = solver.turnstile(
          sitekey='3x00000000000000000000FF',
          url='https://2captcha.com/demo/cloudflare-turnstile',
      )

  except Exception as e:
      sys.exit(e)

  else:
      sys.exit('solved: ' + str(result))
  ```
  </div>

  <div id="csharp-code-example" data-component="TabPanel">

  ```ruby
  require 'api_2captcha'

  client =  Api2Captcha.new("YOUR_API_KEY")

  result = client.turnstile({
  sitekey: '3x00000000000000000000FF',
  pageurl: 'https://2captcha.com/demo/cloudflare-turnstile'
  })
  ```
  </div>
</div>


## Useful links

* [Turnstile demo page](/demo/cloudflare-turnstile)
* [How to bypass Turnstile](/p/cloudflare-turnstile)
* [Video how to bypass Turnstile](https://youtu.be/ZoSWMgNwfuM)
* [Turnstile on Cloudflare Challenge pages](/blog/bypass-cloudflare-turnstile-captcha)