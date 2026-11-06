export function downloadCsv(name:string,rows:(string|number)[][]) {
  const csv=rows.map(row=>row.map(v=>{const text=String(v);const safe=/^[=+@\-\t\r]/.test(text)?`'${text}`:text;return `"${safe.replaceAll('"','""')}"`;}).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
