Page({ data:{city:''}, onLoad(options){this.setData({city:decodeURIComponent(options.city||'')});}, copyAddress(){wx.setClipboardData({data:`${this.data.city}场会场地址（待会务确认）`});} });
