(function(){const config={
  "version": 1,
  "demo": true,
  "store": {
    "id": "cleanpro",
    "name": "CleanPro",
    "currency": "PLN",
    "locale": "pl-PL",
    "colors": {
      "primary": "#082331",
      "accent": "#b9ef37"
    },
    "seller": null
  },
  "bundles": {
    "Basic": 199,
    "Plus": 249,
    "Premium": 299
  },
  "recommended": "Plus",
  "accessories": [
    {
      "name": "Szczotka zapasowa",
      "sku": "spare-brush",
      "price": 29.9,
      "img": "assets/replaceable_brush.webp"
    },
    {
      "name": "Szczotka do silnych zabrudzeń",
      "sku": "heavy-brush",
      "price": 39.9,
      "img": "assets/brush_heads.webp"
    },
    {
      "name": "Zestaw dodatkowych końcówek",
      "sku": "extra-heads",
      "price": 69.9,
      "img": "assets/brush_heads.webp"
    }
  ],
  "upsell": [
    [
      "Basic",
      "Plus"
    ],
    [
      "Plus",
      "Premium"
    ]
  ],
  "coupon": {
    "code": "CLEAN10",
    "percent": 10
  },
  "delivery": {
    "locker": {
      "label": "Paczkomat InPost",
      "price": 0
    },
    "courier": {
      "label": "Kurier",
      "price": 14.99
    }
  },
  "payment": {
    "blik": "BLIK",
    "transfer": "Szybki przelew",
    "card": "Karta",
    "cod": "Za pobraniem"
  },
  "codFee": 5,
  "analytics": {
    "ga4": null,
    "metaPixel": null
  }
};function freeze(o){Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v)});return Object.freeze(o)}window.DropConfig=freeze(config)})();