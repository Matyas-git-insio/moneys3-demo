import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";

import {
  constants as fsConstants
} from "node:fs";

import {
  spawn
} from "node:child_process";

import * as path from "node:path";

import {
  XMLParser,
  XMLBuilder
} from "fast-xml-parser";


export type MoneyCustomer = {
  guid?: string;
  code?: string;
  name: string;
  ico?: string;
  dic?: string;
  street?: string;
  city?: string;
  postCode?: string;
  country?: string;
  countryCode?: string;
  mobilePrefix?: string;
  mobile?: string;
  vatPayer?: boolean;
  physicalPerson?: boolean;
};


export type NewMoneyCustomer = {
  code: string;
  name: string;
  ico?: string;
  dic?: string;
  street?: string;
  city?: string;
  postCode?: string;
  country?: string;
  countryCode?: string;
  mobilePrefix?: string;
  mobile?: string;
  vatPayer?: boolean;
  physicalPerson?: boolean;
};


export type MoneyCustomerUpdate = {
  name?: string;
  ico?: string;
  dic?: string;
  street?: string;
  city?: string;
  postCode?: string;
  country?: string;
  countryCode?: string;
  mobilePrefix?: string;
  mobile?: string;
  vatPayer?: boolean;
  physicalPerson?: boolean;
};


export type CustomerPage = {
  items: MoneyCustomer[];
  start: number;
  limit: number;
  total: number;
};


export class MoneyCustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyCustomerError";
  }
}


type XmlObject =
  Record<string, any>;


type TransferContext = {
  agendaCode: string;
  year: string;
  transferCode: string;
};


function text(
  value: unknown
): string | undefined {

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return String(value);
}


function normalizeIdentifier(
  value: string
): string {

  return value
    .trim()
    .replace(/[{}]/g, "")
    .toLowerCase();
}


function toBoolean(
  value: unknown
): boolean | undefined {

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return String(value) === "1";
}


function removeUndefined(
  value: any
): any {

  if (Array.isArray(value)) {

    return value
      .map(removeUndefined)
      .filter(
        item =>
          item !== undefined
      );
  }


  if (
    typeof value === "object" &&
    value !== null
  ) {

    const result:
      Record<string, any> = {};


    for (
      const [key, item]
      of Object.entries(value)
    ) {

      const cleaned =
        removeUndefined(item);


      if (
        cleaned === undefined
      ) {
        continue;
      }


      if (
        typeof cleaned === "object" &&
        cleaned !== null &&
        !Array.isArray(cleaned) &&
        Object.keys(cleaned).length === 0
      ) {
        continue;
      }


      result[key] =
        cleaned;
    }


    return result;
  }


  return value;
}


function timestamp():
  string {

  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


export class MoneyCustomerClient {

  private readonly sourceXmlPath: string;
  private readonly outputDirectory: string;

  private readonly configuredMoneyExePath?: string;
  private readonly moneyPassword?: string;
  private readonly configuredTransferCode?: string;

  private readonly parser: XMLParser;
  private readonly builder: XMLBuilder;


  constructor(options: {
    sourceXmlPath: string;
    outputDirectory?: string;

    moneyExePath?: string;
    moneyPassword?: string;
    transferCode?: string;
  }) {

    this.sourceXmlPath =
      path.resolve(
        options.sourceXmlPath
      );


    this.outputDirectory =
      path.resolve(
        options.outputDirectory ??
        "./imports"
      );


    this.configuredMoneyExePath =
      options.moneyExePath ??
      process.env.MONEY_S3_EXE;


    this.moneyPassword =
      options.moneyPassword ??
      process.env.MONEY_S3_PASSWORD;


    this.configuredTransferCode =
      options.transferCode;


    this.parser =
      new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: true
      });


    this.builder =
      new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        format: true,
        suppressEmptyNode: true
      });
  }


  private async fileExists(
    filePath: string
  ): Promise<boolean> {

    try {

      await access(
        filePath,
        fsConstants.F_OK
      );

      return true;

    } catch {

      return false;
    }
  }


  private async resolveMoneyExePath():
    Promise<string> {

    if (
      this.configuredMoneyExePath
    ) {

      const configured =
        path.resolve(
          this.configuredMoneyExePath
        );


      if (
        await this.fileExists(
          configured
        )
      ) {

        return configured;
      }


      throw new MoneyCustomerError(
        `Money S3 executable not found: ${configured}`
      );
    }


    const candidates = [

      "C:\\Program Files\\Seyfor\\Money S3\\MonS3.exe",

      "C:\\Program Files (x86)\\Seyfor\\Money S3\\MonS3.exe",

      "C:\\Program Files\\Solitea\\Money S3\\MonS3.exe",

      "C:\\Program Files (x86)\\Solitea\\Money S3\\MonS3.exe",

      "C:\\Program Files\\CIGLER SOFTWARE\\Money S3\\MonS3.exe",

      "C:\\Program Files (x86)\\CIGLER SOFTWARE\\Money S3\\MonS3.exe"
    ];


    for (
      const candidate
      of candidates
    ) {

      if (
        await this.fileExists(
          candidate
        )
      ) {

        return candidate;
      }
    }


    throw new MoneyCustomerError(
      [
        "Cannot find MonS3.exe automatically.",
        "",
        "Run this in PowerShell:",
        "",
        'Get-ChildItem "C:\\Program Files","C:\\Program Files (x86)" -Filter MonS3.exe -Recurse -ErrorAction SilentlyContinue | Select-Object FullName',
        "",
        "Then set:",
        "",
        '$env:MONEY_S3_EXE = "FULL_PATH_TO_MonS3.exe"'
      ].join("\n")
    );
  }


  async getMoneyExePath():
    Promise<string> {

    return await this.resolveMoneyExePath();
  }


  private async runMoney(
    args: string[]
  ): Promise<void> {

    const exe =
      await this.resolveMoneyExePath();


    const finalArgs =
      [...args];


    if (
      this.moneyPassword
    ) {

      finalArgs.push(
        `/p${this.moneyPassword}`
      );
    }


    await new Promise<void>(
      (
        resolve,
        reject
      ) => {

        const child =
          spawn(
            exe,
            finalArgs,
            {
              windowsHide: true,
              stdio: [
                "ignore",
                "pipe",
                "pipe"
              ]
            }
          );


        let stdout = "";
        let stderr = "";


        child.stdout?.on(
          "data",
          data => {

            stdout +=
              String(data);
          }
        );


        child.stderr?.on(
          "data",
          data => {

            stderr +=
              String(data);
          }
        );


        child.on(
          "error",
          error => {

            reject(
              new MoneyCustomerError(
                `Failed to start Money S3: ${error.message}`
              )
            );
          }
        );


        child.on(
          "close",
          code => {

            if (
              code === 0
            ) {

              resolve();

              return;
            }


            reject(
              new MoneyCustomerError(
                [
                  `Money S3 finished with exit code ${code}.`,
                  stdout.trim(),
                  stderr.trim()
                ]
                  .filter(Boolean)
                  .join("\n")
              )
            );
          }
        );
      }
    );
  }


  private async loadRoot():
    Promise<XmlObject> {

    let xml: string;


    try {

      xml =
        await readFile(
          this.sourceXmlPath,
          "utf8"
        );

    } catch {

      throw new MoneyCustomerError(
        `Cannot read XML file: ${this.sourceXmlPath}`
      );
    }


    const document =
      this.parser.parse(
        xml
      );


    if (
      !document ||
      !document.MoneyData
    ) {

      throw new MoneyCustomerError(
        "Invalid Money S3 XML: MoneyData element not found."
      );
    }


    return document.MoneyData;
  }


  private async getTransferContext():
    Promise<TransferContext> {

    const root =
      await this.loadRoot();


    const agendaCode =
      text(
        root["@_KodAgendy"]
      );


    const fiscalStart =
      text(
        root["@_HospRokOd"]
      );


    const transferCode =
      this.configuredTransferCode ??
      text(
        root["@_ExpZkratka"]
      ) ??
      "_ADR";


    const year =
      fiscalStart
        ?.match(
          /^(\d{4})-/
        )?.[1];


    if (!agendaCode) {

      throw new MoneyCustomerError(
        "KodAgendy was not found in moneys3new.xml."
      );
    }


    if (!year) {

      throw new MoneyCustomerError(
        "HospRokOd was not found in moneys3new.xml."
      );
    }


    return {
      agendaCode,
      year,
      transferCode
    };
  }


  async syncFromMoney():
    Promise<string> {

    const context =
      await this.getTransferContext();


    const tempFile =
      path.join(
        path.dirname(
          this.sourceXmlPath
        ),
        `moneys3-auto-export-${timestamp()}.xml`
      );


    await rm(
      tempFile,
      {
        force: true
      }
    );


    console.log(
      "Starting automatic Money S3 XML export..."
    );


    await this.runMoney([
      "/eXXXML",

      `/fcE${context.transferCode}`,

      "/ftD",

      "/fw-",

      `/ff${tempFile}`,

      `/a:K${context.agendaCode}`,

      `/r:R${context.year}`
    ]);


    if (
      !await this.fileExists(
        tempFile
      )
    ) {

      throw new MoneyCustomerError(
        `Money S3 did not create export file: ${tempFile}`
      );
    }


    const info =
      await stat(
        tempFile
      );


    if (
      info.size === 0
    ) {

      throw new MoneyCustomerError(
        "Money S3 created an empty export file."
      );
    }


    await copyFile(
      tempFile,
      this.sourceXmlPath
    );


    await rm(
      tempFile,
      {
        force: true
      }
    );


    console.log(
      "Money S3 export finished."
    );


    return this.sourceXmlPath;
  }


  async importXmlIntoMoney(
    xmlFilePath: string
  ): Promise<string> {

    const context =
      await this.getTransferContext();


    const importPath =
      path.resolve(
        xmlFilePath
      );


    if (
      !await this.fileExists(
        importPath
      )
    ) {

      throw new MoneyCustomerError(
        `Import XML does not exist: ${importPath}`
      );
    }


    const reportDirectory =
      path.join(
        this.outputDirectory,
        "reports"
      );


    await mkdir(
      reportDirectory,
      {
        recursive: true
      }
    );


    const reportPath =
      path.join(
        reportDirectory,
        `money-import-report-${timestamp()}.xml`
      );


    console.log(
      "Starting automatic Money S3 XML import..."
    );


    await this.runMoney([
      "/eXXXML",

      `/fcI${context.transferCode}`,

      "/ftD",

      "/fw-",

      `/ff${importPath}`,

      `/fr${reportPath}`,

      "/fmN",

      `/a:K${context.agendaCode}`,

      `/r:R${context.year}`
    ]);


    console.log(
      "Money S3 import finished."
    );


    return reportPath;
  }


  private getFirmaObjects(
    root: XmlObject
  ): XmlObject[] {

    const firma =
      root
        ?.SeznamFirem
        ?.Firma;


    if (!firma) {

      return [];
    }


    if (
      Array.isArray(
        firma
      )
    ) {

      return firma;
    }


    return [firma];
  }


  private mapFirma(
    firma: XmlObject
  ): MoneyCustomer {

    return {

      guid:
        text(
          firma.GUID
        ),

      code:
        text(
          firma.KodPartn
        ),

      name:
        text(
          firma.Nazev
        ) ?? "",

      ico:
        text(
          firma.ICO
        ),

      dic:
        text(
          firma.DIC
        ),

      street:
        text(
          firma.Adresa?.Ulice
        ),

      city:
        text(
          firma.Adresa?.Misto
        ),

      postCode:
        text(
          firma.Adresa?.PSC
        ),

      country:
        text(
          firma.Adresa?.Stat
        ),

      countryCode:
        text(
          firma.Adresa?.KodStatu
        ),

      mobilePrefix:
        text(
          firma.Mobil?.Pred
        ),

      mobile:
        text(
          firma.Mobil?.Cislo
        ),

      vatPayer:
        toBoolean(
          firma.PlatceDPH
        ),

      physicalPerson:
        toBoolean(
          firma.FyzOsoba
        )
    };
  }


  async readCustomers():
    Promise<MoneyCustomer[]> {

    const root =
      await this.loadRoot();


    return this
      .getFirmaObjects(
        root
      )
      .map(
        firma =>
          this.mapFirma(
            firma
          )
      );
  }


  async getCustomersPage(
    start: number = 0,
    limit: number = 100
  ): Promise<CustomerPage> {

    const customers =
      await this.readCustomers();


    return {

      items:
        customers.slice(
          start,
          start + limit
        ),

      start,

      limit,

      total:
        customers.length
    };
  }


  async *iterateCustomers(
    pageSize: number = 100
  ): AsyncGenerator<MoneyCustomer> {

    let start = 0;


    while (true) {

      const page =
        await this.getCustomersPage(
          start,
          pageSize
        );


      if (
        page.items.length === 0
      ) {

        return;
      }


      for (
        const customer
        of page.items
      ) {

        yield customer;
      }


      start +=
        page.items.length;


      if (
        start >= page.total
      ) {

        return;
      }
    }
  }


  async getCustomer(
    identifier: string
  ): Promise<MoneyCustomer | null> {

    const customers =
      await this.readCustomers();


    const wanted =
      normalizeIdentifier(
        identifier
      );


    return (
      customers.find(
        customer => {

          const identifiers =
            [
              customer.guid,
              customer.code,
              customer.ico
            ]
              .filter(
                (
                  value
                ): value is string =>
                  Boolean(value)
              )
              .map(
                normalizeIdentifier
              );


          return identifiers
            .includes(
              wanted
            );
        }
      ) ?? null
    );
  }


  private buildAddress(
    customer: {
      street?: string;
      city?: string;
      postCode?: string;
      country?: string;
      countryCode?: string;
    }
  ): XmlObject | undefined {

    const address =
      removeUndefined({

        Ulice:
          customer.street,

        Misto:
          customer.city,

        PSC:
          customer.postCode,

        Stat:
          customer.country,

        KodStatu:
          customer.countryCode
      });


    if (
      Object.keys(
        address
      ).length === 0
    ) {

      return undefined;
    }


    return address;
  }


  private buildMobile(
    customer: {
      mobilePrefix?: string;
      mobile?: string;
    }
  ): XmlObject | undefined {

    const mobile =
      removeUndefined({

        Pred:
          customer.mobilePrefix,

        Cislo:
          customer.mobile
      });


    if (
      Object.keys(
        mobile
      ).length === 0
    ) {

      return undefined;
    }


    return mobile;
  }


  private getRootAttributes(
    sourceRoot: XmlObject
  ): XmlObject {

    const attributes:
      XmlObject = {};


    for (
      const [key, value]
      of Object.entries(
        sourceRoot
      )
    ) {

      if (
        key.startsWith(
          "@_"
        )
      ) {

        attributes[key] =
          value;
      }
    }


    const now =
      new Date();


    attributes["@_ExpDate"] =
      now
        .toISOString()
        .slice(
          0,
          10
        );


    attributes["@_ExpTime"] =
      now
        .toTimeString()
        .slice(
          0,
          8
        );


    attributes["@_description"] =
      "adresy";


    attributes["@_ExpZkratka"] =
      "_ADR";


    return attributes;
  }


  private async writeImportFile(
    operation:
      "create" |
      "update" |
      "delete",

    firma:
      XmlObject
  ): Promise<string> {

    const sourceRoot =
      await this.loadRoot();


    const moneyData = {

      ...this.getRootAttributes(
        sourceRoot
      ),

      SeznamFirem: {

        Firma:
          removeUndefined(
            firma
          )
      }
    };


    const object = {

      MoneyData:
        moneyData
    };


    const body =
      this.builder.build(
        object
      );


    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;


    await mkdir(
      this.outputDirectory,
      {
        recursive: true
      }
    );


    const fileName =
      `money-customer-${operation}-${timestamp()}.xml`;


    const filePath =
      path.resolve(
        this.outputDirectory,
        fileName
      );


    await writeFile(
      filePath,
      xml,
      "utf8"
    );


    return filePath;
  }


  async createCustomerImport(
    customer: NewMoneyCustomer
  ): Promise<string> {

    const address =
      this.buildAddress(
        customer
      );


    const mobile =
      this.buildMobile(
        customer
      );


    const firma =
      removeUndefined({

        Nazev:
          customer.name,

        Adresa:
          address,

        ObchNazev:
          customer.name,

        ObchAdresa:
          address,

        FaktNazev:
          customer.name,

        FaktAdresa:
          address,

        Mobil:
          mobile,

        ICO:
          customer.ico,

        DIC:
          customer.dic,

        PlatceDPH:
          customer.vatPayer
            === undefined
            ? undefined
            : customer.vatPayer
              ? "1"
              : "0",

        FyzOsoba:
          customer.physicalPerson
            === undefined
            ? undefined
            : customer.physicalPerson
              ? "1"
              : "0",

        KodPartn:
          customer.code
      });


    return await this.writeImportFile(
      "create",
      firma
    );
  }


  async updateCustomerImport(
    identifier: string,
    changes: MoneyCustomerUpdate
  ): Promise<string> {

    const existing =
      await this.getCustomer(
        identifier
      );


    if (!existing) {

      throw new MoneyCustomerError(
        `Customer not found: ${identifier}`
      );
    }


    const address =
      this.buildAddress(
        changes
      );


    const mobile =
      this.buildMobile(
        changes
      );


    const firma =
      removeUndefined({

        GUID:
          existing.guid,

        Nazev:
          changes.name,

        Adresa:
          address,

        ObchNazev:
          changes.name,

        ObchAdresa:
          address,

        FaktNazev:
          changes.name,

        FaktAdresa:
          address,

        Mobil:
          mobile,

        ICO:
          changes.ico,

        DIC:
          changes.dic,

        PlatceDPH:
          changes.vatPayer
            === undefined
            ? undefined
            : changes.vatPayer
              ? "1"
              : "0",

        FyzOsoba:
          changes.physicalPerson
            === undefined
            ? undefined
            : changes.physicalPerson
              ? "1"
              : "0",

        KodPartn:
          existing.code
      });


    return await this.writeImportFile(
      "update",
      firma
    );
  }


  async deleteCustomerImport(
    identifier: string
  ): Promise<string> {

    const existing =
      await this.getCustomer(
        identifier
      );


    if (!existing) {

      throw new MoneyCustomerError(
        `Customer not found: ${identifier}`
      );
    }


    const firma =
      removeUndefined({

        GUID:
          existing.guid,

        ICO:
          existing.ico,

        KodPartn:
          existing.code,

        DeleteImport:
          "1"
      });


    return await this.writeImportFile(
      "delete",
      firma
    );
  }


  async createCustomer(
    customer: NewMoneyCustomer
  ): Promise<MoneyCustomer> {

    await this.syncFromMoney();


    const importFile =
      await this.createCustomerImport(
        customer
      );


    const report =
      await this.importXmlIntoMoney(
        importFile
      );


    await this.syncFromMoney();


    const created =
      await this.getCustomer(
        customer.code
      );


    if (!created) {

      throw new MoneyCustomerError(
        [
          "Money S3 import finished, but the customer was not found afterwards.",
          `Customer: ${customer.code}`,
          `Import report: ${report}`
        ].join("\n")
      );
    }


    return created;
  }


  async updateCustomer(
    identifier: string,
    changes: MoneyCustomerUpdate
  ): Promise<MoneyCustomer> {

    await this.syncFromMoney();


    const importFile =
      await this.updateCustomerImport(
        identifier,
        changes
      );


    const report =
      await this.importXmlIntoMoney(
        importFile
      );


    await this.syncFromMoney();


    const updated =
      await this.getCustomer(
        identifier
      );


    if (!updated) {

      throw new MoneyCustomerError(
        [
          "Money S3 update finished, but the customer could not be found afterwards.",
          `Customer: ${identifier}`,
          `Import report: ${report}`
        ].join("\n")
      );
    }


    return updated;
  }


  async deleteCustomer(
    identifier: string
  ): Promise<void> {

    await this.syncFromMoney();


    const importFile =
      await this.deleteCustomerImport(
        identifier
      );


    const report =
      await this.importXmlIntoMoney(
        importFile
      );


    await this.syncFromMoney();


    const remaining =
      await this.getCustomer(
        identifier
      );


    if (remaining) {

      throw new MoneyCustomerError(
        [
          "Money S3 delete import finished, but the customer still exists.",
          `Customer: ${identifier}`,
          `Import report: ${report}`
        ].join("\n")
      );
    }
  }
}