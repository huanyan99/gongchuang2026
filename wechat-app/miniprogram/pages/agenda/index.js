Page({ data:{city:''}, onLoad(options){ this.setData({city:decodeURIComponent(options.city||'')}); } });
