export type SalesRecord={month:string;parentAsin:string;childAsin:string;title:string;sales:number;units:number;orders:number;sessions:number;pageViews:number;conversion:number;sku?:string;color?:string;size?:string};
export type CatalogRecord={sku:string;asin:string;relationship:string;parentSku:string;title:string;color:string;size:string;style:string;metalType:string;imageUrl:string};
export type MissingAsin=CatalogRecord&{detectedAt:string;previousFile:string;currentFile:string};
export type AttributeChange={asin:string;sku:string;parentSku:string;changedFields:string[];changes:{field:string;previous:string;current:string}[];detectedAt:string;previousFile:string;currentFile:string};
export type ImportedState={businessReportData:any[];orderExportData:any[];catalogData:CatalogRecord[];salesRecords:SalesRecord[];asinChanges:any[];asinHistory:any[];uploadHistory:any[];missingAsins:MissingAsin[];attributeChanges:AttributeChange[]};
const KEY="cdc-imported-data-v3-real";const EMPTY:ImportedState={businessReportData:[],orderExportData:[],catalogData:[],salesRecords:[],asinChanges:[],asinHistory:[],uploadHistory:[],missingAsins:[],attributeChanges:[]};
// Retired browser storage is not authenticated, account-scoped, or encrypted.
export function getImportedState():ImportedState{return structuredClone(EMPTY)}
export function setImportedState(_state:ImportedState):never{throw new Error('Browser-local report storage is disabled. Use authenticated server uploads.');}
export function clearImportedState(){localStorage.removeItem(KEY);window.dispatchEvent(new CustomEvent("cdc-data-updated"));}
