const PRACTICE_ITEMS = ['欢迎致辞','智慧产线愿景、模式、进展分享','智能硬件赋能切割智能制造创新实践分享','茶歇','智能焊接创新实践分享','柏楚技术愿景分享','解决方案介绍及交流互动'];
Page({data:{city:'',available:false,practiceItems:PRACTICE_ITEMS},onLoad(options){const city=decodeURIComponent(options.city||'');this.setData({city,available:city==='佛山'||city==='济南'});}});
