// Shared settings and safe diagnostics. No network or storage operations.
export function summaryTriggerMessagesV01169(settings={}) {
    const value=Number(settings.triggerMessages);
    return Number.isFinite(value)&&value>=1?Math.min(50,Math.floor(value)):10;
}

export function summaryRoutineBatchV01169(settings={},paid=false) {
    const value=Number(settings.batchMessages);
    const batch=Number.isFinite(value)&&value>=1?Math.min(60,Math.floor(value)):30;
    return paid?Math.min(summaryTriggerMessagesV01169(settings),batch):batch;
}

export function redactSummaryDiagnosticV01169(value,key='') {
    let text=String(value??'');
    // Redact before truncation: a long echoed credential must not leak a prefix.
    for(const secret of [String(key||''),String(key||'').replace(/^Bearer\s+/i,'')]) {
        if(secret) text=text.split(secret).join('[REDACTED]');
    }
    return text.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_\-]+/g,'[REDACTED]')
        .replace(/((?:api[_-]?key|authorization|access[_-]?token)\s*["']?\s*[:=]\s*["']?)[^\s,"'<>}&]+/gi,'$1[REDACTED]')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
        .replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,1200);
}

export function summaryHttpErrorDetailsV01169(raw,status,key='') {
    let data;try{data=JSON.parse(String(raw||''));}catch(_){}
    const error=data?.error;
    const message=typeof error==='string'?error:
        error?.message??data?.message??data?.detail??data?.msg;
    const clean=value=>redactSummaryDiagnosticV01169(typeof value==='object'?JSON.stringify(value):value,key);
    const serverMessage=clean(message??(data?'':String(raw||'')))||'服务端未提供可读错误原因';
    const code=clean(error?.code??data?.code??'');
    const type=clean(error?.type??data?.type??'');
    const param=clean(error?.param??data?.param??'');
    const text=[serverMessage,code,type,param].join(' ');
    let hint='请按服务端错误原因检查；HTTP 状态码本身不能确定具体原因。不要连续重试。';
    if(/context.{0,30}(?:length|limit)|too (?:long|many tokens)|maximum.{0,25}tokens|上下文|输入.{0,12}(?:过长|超限)/i.test(text)) hint='服务端提示上下文或 token 限制；可缩小每批消息上限后，在实际待总结任务中手动继续。';
    else if(/unsupported.{0,30}(?:param|field)|unknown.{0,20}(?:param|field)|invalid.{0,15}(?:param|argument)|不支持.{0,10}参数/i.test(text)) hint='服务端提示请求参数不兼容；请保留错误字段名，用于定位请求格式。';
    else if(/model.{0,30}(?:not found|not exist|unavailable|unsupported)|unknown model|invalid model|模型.{0,15}(?:不存在|不可用)/i.test(text)) hint='服务端提示该模型标识或模型路由不可用；其他模型可用不代表这条路由可用。';
    else if(/quota|credit|balance|billing|余额|额度/i.test(text)) hint='服务端提示额度或计费限制；请检查该模型或渠道的可用额度。';
    else if(Number(status)===503) hint='服务端或其上游暂时无法提供服务；具体路由原因以服务端信息为准。SMM 不自动重试，请勿连续点击。';
    return {httpStatus:Number(status)||null,serverMessage,serverCode:code,serverType:type,serverParam:param,hint};
}
