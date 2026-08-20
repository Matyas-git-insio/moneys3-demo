import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";

import * as path from "node:path";

import {
  XMLBuilder,
  XMLParser
} from "fast-xml-parser";

import {
  MoneyCustomerClient
} from "./money-customer";


export type MoneyInvoiceKind =
  | "issued"
  | "received";


export type MoneyInvoiceItem = {
  description: string;
  quantity: number;
  vatRate: number;
  unitPriceGross: number;
  unit?: string;
};


export type MoneyInvoice = {
  kind: MoneyInvoiceKind;
  documentNumber: string;
  guid?: string;
  series?: string;
  seriesNumber?: string;
  description?: string;
  dateOfIssue?: string;
  dateOfTaxing?: string;
  dueDate?: string;
  variableSymbol?: string;
  paymentMethod?: string;
  total?: number;
  partnerCode?: string;
  partnerName?: string;
  partnerIco?: string;
  partnerDic?: string;
  items: MoneyInvoiceItem[];
};


export type NewMoneyInvoice = {
  kind: MoneyInvoiceKind;
  partnerCode: string;
  description: string;
  dateOfIssue: string;
  dueDate: string;
  items: MoneyInvoiceItem[];
  dateOfTaxing?: string;
  variableSymbol?: string;
  receivedDocumentNumber?: string;
  paymentMethod?: string;
};


export type MoneyInvoiceUpdate = {
  description?: string;
  dueDate?: string;
  paymentMethod?: string;
};


export type InvoicePage = {
  items: MoneyInvoice[];
  start: number;
  limit: number;
  total: number;
};


export class MoneyInvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyInvoiceError";
  }
}


type XmlObject =
  Record<string, any>;


type InvoiceCalculation = {
  total: number;
  summary: XmlObject;
  items: XmlObject[];
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


function numberValue(
  value: unknown
): number | undefined {
  const valueText =
    text(value);

  if (
    valueText === undefined ||
    valueText.trim() === ""
  ) {
    return undefined;
  }

  const result =
    Number(valueText);

  return Number.isFinite(result)
    ? result
    : undefined;
}


function normalizeIdentifier(
  value: string
): string {
  return value
    .trim()
    .replace(/[{}]/g, "")
    .toLowerCase();
}


function normalizeArray<T>(
  value: T | T[] | undefined
): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
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


function round2(
  value: number
): number {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}


function round4(
  value: number
): number {
  return Math.round(
    (value + Number.EPSILON) * 10000
  ) / 10000;
}


function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


export class MoneyInvoiceClient {
  private readonly sourceXmlPath: string;
  private readonly customerXmlPath: string;
  private readonly outputDirectory: string;

  private readonly runner:
    MoneyCustomerClient;

  private readonly parser:
    XMLParser;

  private readonly builder:
    XMLBuilder;


  constructor(options: {
    sourceXmlPath: string;
    customerXmlPath: string;
    outputDirectory?: string;
    moneyExePath?: string;
    moneyPassword?: string;
  }) {
    this.sourceXmlPath =
      path.resolve(
        options.sourceXmlPath
      );

    this.customerXmlPath =
      path.resolve(
        options.customerXmlPath
      );

    this.outputDirectory =
      path.resolve(
        options.outputDirectory ??
        "./imports"
      );

    this.runner =
      new MoneyCustomerClient({
        sourceXmlPath:
          this.sourceXmlPath,

        outputDirectory:
          this.outputDirectory,

        moneyExePath:
          options.moneyExePath,

        moneyPassword:
          options.moneyPassword,

        transferCode:
          "_FP+FV"
      });

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


  private async loadXmlRoot(
    filePath: string
  ): Promise<XmlObject> {
    let xml: string;

    try {
      xml =
        await readFile(
          filePath,
          "utf8"
        );

    } catch {
      throw new MoneyInvoiceError(
        `Cannot read XML file: ${filePath}`
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
      throw new MoneyInvoiceError(
        `Invalid Money S3 XML file: ${filePath}`
      );
    }

    return document.MoneyData;
  }


  private async loadRoot():
    Promise<XmlObject> {
    return await this.loadXmlRoot(
      this.sourceXmlPath
    );
  }


  async syncFromMoney():
    Promise<string> {
    return await this.runner
      .syncFromMoney();
  }


  private getInvoiceObjects(
    root: XmlObject,
    kind: MoneyInvoiceKind
  ): XmlObject[] {
    if (
      kind === "issued"
    ) {
      return normalizeArray(
        root
          ?.SeznamFaktVyd
          ?.FaktVyd
      );
    }

    return normalizeArray(
      root
        ?.SeznamFaktPrij
        ?.FaktPrij
    );
  }


  private mapItem(
    item: XmlObject
  ): MoneyInvoiceItem {
    return {
      description:
        text(
          item.Popis
        ) ?? "",

      quantity:
        numberValue(
          item.PocetMJ
        ) ?? 0,

      vatRate:
        numberValue(
          item.SazbaDPH
        ) ?? 0,

      unitPriceGross:
        numberValue(
          item.Cena
        ) ?? 0,

      unit:
        text(
          item.NesklPolozka?.MJ ??
          item.SklPolozka?.KmKarta?.MJ
        )
    };
  }


  private mapInvoice(
    kind: MoneyInvoiceKind,
    invoice: XmlObject
  ): MoneyInvoice {
    const items =
      normalizeArray<XmlObject>(
        invoice
          ?.SeznamPolozek
          ?.Polozka
      )
        .map(
          item =>
            this.mapItem(
              item
            )
        );

    return {
      kind,

      documentNumber:
        text(
          invoice.Doklad
        ) ?? "",

      guid:
        text(
          invoice.GUID
        ),

      series:
        text(
          invoice.Rada
        ),

      seriesNumber:
        text(
          invoice.CisRada
        ),

      description:
        text(
          invoice.Popis
        ),

      dateOfIssue:
        text(
          invoice.Vystaveno
        ),

      dateOfTaxing:
        text(
          invoice.PlnenoDPH
        ),

      dueDate:
        text(
          invoice.Splatno
        ),

      variableSymbol:
        text(
          invoice.VarSymbol
        ),

      paymentMethod:
        text(
          invoice.Uhrada
        ),

      total:
        numberValue(
          invoice.Celkem
        ),

      partnerCode:
        text(
          invoice.DodOdb?.KodPartn
        ),

      partnerName:
        text(
          invoice.DodOdb?.ObchNazev ??
          invoice.DodOdb?.Nazev
        ),

      partnerIco:
        text(
          invoice.DodOdb?.ICO
        ),

      partnerDic:
        text(
          invoice.DodOdb?.DIC
        ),

      items
    };
  }


  async readInvoices(
    kind?: MoneyInvoiceKind
  ): Promise<MoneyInvoice[]> {
    const root =
      await this.loadRoot();

    if (kind) {
      return this
        .getInvoiceObjects(
          root,
          kind
        )
        .map(
          invoice =>
            this.mapInvoice(
              kind,
              invoice
            )
        );
    }

    return [
      ...this
        .getInvoiceObjects(
          root,
          "issued"
        )
        .map(
          invoice =>
            this.mapInvoice(
              "issued",
              invoice
            )
        ),

      ...this
        .getInvoiceObjects(
          root,
          "received"
        )
        .map(
          invoice =>
            this.mapInvoice(
              "received",
              invoice
            )
        )
    ];
  }


  async getInvoicesPage(
    kind: MoneyInvoiceKind | undefined,
    start: number = 0,
    limit: number = 100
  ): Promise<InvoicePage> {
    const invoices =
      await this.readInvoices(
        kind
      );

    return {
      items:
        invoices.slice(
          start,
          start + limit
        ),

      start,
      limit,
      total:
        invoices.length
    };
  }


  async getInvoice(
    kind: MoneyInvoiceKind,
    identifier: string
  ): Promise<MoneyInvoice | null> {
    const invoices =
      await this.readInvoices(
        kind
      );

    const wanted =
      normalizeIdentifier(
        identifier
      );

    return (
      invoices.find(
        invoice => {
          const identifiers = [
            invoice.guid,
            invoice.documentNumber,
            invoice.variableSymbol
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


  private async getInvoiceXmlObject(
    kind: MoneyInvoiceKind,
    identifier: string
  ): Promise<XmlObject | null> {
    const root =
      await this.loadRoot();

    const wanted =
      normalizeIdentifier(
        identifier
      );

    return (
      this
        .getInvoiceObjects(
          root,
          kind
        )
        .find(
          invoice => {
            const identifiers = [
              text(
                invoice.GUID
              ),
              text(
                invoice.Doklad
              ),
              text(
                invoice.VarSymbol
              )
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


  private async getPartner(
    partnerCode: string
  ): Promise<XmlObject> {
    const root =
      await this.loadXmlRoot(
        this.customerXmlPath
      );

    const firms =
      normalizeArray<XmlObject>(
        root
          ?.SeznamFirem
          ?.Firma
      );

    const wanted =
      normalizeIdentifier(
        partnerCode
      );

    const firm =
      firms.find(
        item =>
          normalizeIdentifier(
            text(
              item.KodPartn
            ) ?? ""
          ) === wanted
      );

    if (!firm) {
      throw new MoneyInvoiceError(
        `Partner was not found in moneys3new.xml: ${partnerCode}`
      );
    }

    const address =
      firm.Adresa;

    return removeUndefined({
      ObchNazev:
        firm.ObchNazev ??
        firm.Nazev,

      ObchAdresa:
        firm.ObchAdresa ??
        address,

      FaktNazev:
        firm.FaktNazev ??
        firm.Nazev,

      ICO:
        firm.ICO,

      DIC:
        firm.DIC,

      FaktAdresa:
        firm.FaktAdresa ??
        address,

      Nazev:
        firm.Nazev,

      Adresa:
        address,

      GUID:
        firm.GUID,

      Tel:
        firm.Tel,

      Mobil:
        firm.Mobil,

      EMail:
        firm.EMail,

      WWW:
        firm.WWW,

      PlatceDPH:
        firm.PlatceDPH,

      FyzOsoba:
        firm.FyzOsoba,

      Banka:
        firm.Banka,

      Ucet:
        firm.Ucet,

      KodBanky:
        firm.KodBanky,

      KodPartn:
        firm.KodPartn
    });
  }


  private async getDefaultInvoice(
    kind: MoneyInvoiceKind
  ): Promise<XmlObject> {
    const root =
      await this.loadRoot();

    const normal =
      this
        .getInvoiceObjects(
          root,
          kind
        )
        .find(
          invoice =>
            text(
              invoice.Druh
            ) === "N" &&
            text(
              invoice.Dobropis
            ) !== "1"
        );

    if (!normal) {
      throw new MoneyInvoiceError(
        `No normal ${kind} invoice was found to obtain defaults.`
      );
    }

    return normal;
  }


  private async getNextDocumentIdentity(
    kind: MoneyInvoiceKind
  ): Promise<{
    documentNumber: string;
    series?: string;
    seriesNumber: string;
  }> {
    const root =
      await this.loadRoot();

    const list =
      kind === "issued"
        ? [
            ...normalizeArray<XmlObject>(
              root?.SeznamFaktVyd?.FaktVyd
            ),
            ...normalizeArray<XmlObject>(
              root?.SeznamFaktVyd_DPP?.FaktVyd_DPP
            )
          ]
        : [
            ...normalizeArray<XmlObject>(
              root?.SeznamFaktPrij?.FaktPrij
            ),
            ...normalizeArray<XmlObject>(
              root?.SeznamFaktPrij_DPP?.FaktPrij_DPP
            )
          ];

    const defaults =
      await this.getDefaultInvoice(
        kind
      );

    const maxSeriesNumber =
      Math.max(
        0,
        ...list.map(
          invoice =>
            numberValue(
              invoice.CisRada
            ) ?? 0
        )
      );

    const numericDocuments =
      list
        .map(
          invoice =>
            text(
              invoice.Doklad
            )
        )
        .filter(
          (
            value
          ): value is string =>
            typeof value === "string" &&
            /^\d+$/.test(value)
        )
        .map(
          value =>
            Number(value)
        );

    if (
      numericDocuments.length === 0
    ) {
      throw new MoneyInvoiceError(
        `Cannot determine the next ${kind} invoice number.`
      );
    }

    return {
      documentNumber:
        String(
          Math.max(
            ...numericDocuments
          ) + 1
        ),

      series:
        text(
          defaults.Rada
        ),

      seriesNumber:
        String(
          maxSeriesNumber + 1
        )
    };
  }


  private calculateInvoice(
    items: MoneyInvoiceItem[]
  ): InvoiceCalculation {
    if (
      items.length === 0
    ) {
      throw new MoneyInvoiceError(
        "Invoice must contain at least one item."
      );
    }

    let base0 = 0;
    let base12 = 0;
    let vat12 = 0;
    let base21 = 0;
    let vat21 = 0;
    let total = 0;

    const xmlItems:
      XmlObject[] = [];

    items.forEach(
      (
        item,
        index
      ) => {
        if (
          ![0, 12, 21]
            .includes(
              item.vatRate
            )
        ) {
          throw new MoneyInvoiceError(
            "This version supports VAT rates 0, 12 and 21 only."
          );
        }

        if (
          item.quantity <= 0
        ) {
          throw new MoneyInvoiceError(
            "Invoice item quantity must be greater than zero."
          );
        }

        const grossUnit =
          round4(
            item.unitPriceGross
          );

        const baseUnit =
          item.vatRate === 0
            ? grossUnit
            : round4(
                grossUnit /
                (
                  1 +
                  item.vatRate / 100
                )
              );

        const vatUnit =
          round4(
            grossUnit -
            baseUnit
          );

        const base =
          round2(
            baseUnit *
            item.quantity
          );

        const vat =
          round2(
            vatUnit *
            item.quantity
          );

        const gross =
          round2(
            grossUnit *
            item.quantity
          );

        total +=
          gross;

        if (
          item.vatRate === 0
        ) {
          base0 += base;
        }

        if (
          item.vatRate === 12
        ) {
          base12 += base;
          vat12 += vat;
        }

        if (
          item.vatRate === 21
        ) {
          base21 += base;
          vat21 += vat;
        }

        xmlItems.push({
          Popis:
            item.description,

          PocetMJ:
            String(
              item.quantity
            ),

          SazbaDPH:
            String(
              item.vatRate
            ),

          Cena:
            String(
              grossUnit
            ),

          SouhrnDPH: {
            Zaklad_MJ:
              String(
                baseUnit
              ),

            DPH_MJ:
              String(
                vatUnit
              ),

            Zaklad:
              String(
                base
              ),

            DPH:
              String(
                vat
              )
          },

          CenaTyp:
            "1",

          Sleva:
            "0",

          Poradi:
            String(
              index + 1
            ),

          Valuty:
            "0",

          NesklPolozka: {
            MJ:
              item.unit ??
              "ks",

            Zaloha:
              "0",

            TypZarDoby:
              "N",

            ZarDoba:
              "0",

            Protizapis:
              "0",

            Hmotnost:
              "0"
          },

          CenaPoSleve:
            "1"
        });
      }
    );

    return {
      total:
        round2(total),

      summary: {
        Zaklad0:
          String(
            round2(base0)
          ),

        Zaklad5:
          String(
            round2(base12)
          ),

        Zaklad22:
          String(
            round2(base21)
          ),

        DPH5:
          String(
            round2(vat12)
          ),

        DPH22:
          String(
            round2(vat21)
          )
      },

      items:
        xmlItems
    };
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
      "faktury přijaté a vydané";

    attributes["@_ExpZkratka"] =
      "_FP+FV";

    return attributes;
  }


  private async writeImportFile(
    operation:
      | "create"
      | "update"
      | "delete",
    kind: MoneyInvoiceKind,
    invoice: XmlObject
  ): Promise<string> {
    const root =
      await this.loadRoot();

    const listName =
      kind === "issued"
        ? "SeznamFaktVyd"
        : "SeznamFaktPrij";

    const invoiceName =
      kind === "issued"
        ? "FaktVyd"
        : "FaktPrij";

    const body =
      this.builder.build({
        MoneyData: {
          ...this.getRootAttributes(
            root
          ),

          [listName]: {
            [invoiceName]:
              removeUndefined(
                invoice
              )
          }
        }
      });

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;

    await mkdir(
      this.outputDirectory,
      {
        recursive: true
      }
    );

    const filePath =
      path.join(
        this.outputDirectory,
        `money-invoice-${kind}-${operation}-${timestamp()}.xml`
      );

    await writeFile(
      filePath,
      xml,
      "utf8"
    );

    return filePath;
  }


  async createInvoiceImport(
    invoice: NewMoneyInvoice
  ): Promise<{
    filePath: string;
    documentNumber: string;
    variableSymbol: string;
  }> {
    const defaults =
      await this.getDefaultInvoice(
        invoice.kind
      );

    const identity =
      await this.getNextDocumentIdentity(
        invoice.kind
      );

    const partner =
      await this.getPartner(
        invoice.partnerCode
      );

    const calculated =
      this.calculateInvoice(
        invoice.items
      );

    const variableSymbol =
      invoice.variableSymbol ??
      identity.documentNumber;

    const invoiceObject =
      removeUndefined({
        Doklad:
          identity.documentNumber,

        Rada:
          identity.series,

        CisRada:
          identity.seriesNumber,

        Popis:
          invoice.description,

        Vystaveno:
          invoice.dateOfIssue,

        DatUcPr:
          invoice.dateOfIssue,

        PlnenoDPH:
          invoice.dateOfTaxing ??
          invoice.dateOfIssue,

        Splatno:
          invoice.dueDate,

        KonstSym:
          defaults.KonstSym ??
          "0008",

        KodDPH:
          defaults.KodDPH,

        ZjednD:
          invoice.kind === "issued"
            ? defaults.ZjednD ?? "0"
            : undefined,

        VarSymbol:
          variableSymbol,

        PrijatDokl:
          invoice.kind === "received"
            ? invoice.receivedDocumentNumber ??
              variableSymbol
            : undefined,

        Ucet:
          defaults.Ucet ??
          "BAN",

        Druh:
          "N",

        Dobropis:
          "0",

        Uhrada:
          invoice.paymentMethod ??
          defaults.Uhrada ??
          "převodem",

        PredKontac:
          defaults.PredKontac,

        ZpVypDPH:
          defaults.ZpVypDPH ??
          "1",

        SazbaDPH1:
          defaults.SazbaDPH1 ??
          "12",

        SazbaDPH2:
          defaults.SazbaDPH2 ??
          "21",

        Proplatit:
          String(
            calculated.total
          ),

        Vyuctovano:
          "0",

        SouhrnDPH:
          calculated.summary,

        Celkem:
          String(
            calculated.total
          ),

        Typ:
          "REŽIE",

        PriUhrZbyv:
          "0",

        ValutyProp:
          "0",

        SumZaloha:
          "0",

        SumZalohaC:
          "0",

        DodOdb:
          partner,

        DopravTuz:
          "0",

        DopravZahr:
          "0",

        Sleva:
          "0",

        SeznamPolozek: {
          Polozka:
            calculated.items
        }
      });

    const filePath =
      await this.writeImportFile(
        "create",
        invoice.kind,
        invoiceObject
      );

    return {
      filePath,
      documentNumber:
        identity.documentNumber,
      variableSymbol
    };
  }


  async updateInvoiceImport(
    kind: MoneyInvoiceKind,
    identifier: string,
    changes: MoneyInvoiceUpdate
  ): Promise<string> {
    const existing =
      await this.getInvoiceXmlObject(
        kind,
        identifier
      );

    if (!existing) {
      throw new MoneyInvoiceError(
        `Invoice not found: ${identifier}`
      );
    }

    return await this.writeImportFile(
      "update",
      kind,
      {
        GUID:
          existing.GUID,

        Doklad:
          existing.Doklad,

        VarSymbol:
          existing.VarSymbol,

        UpdateHd:
          "1",

        Popis:
          changes.description,

        Splatno:
          changes.dueDate,

        Uhrada:
          changes.paymentMethod
      }
    );
  }


  async deleteInvoiceImport(
    kind: MoneyInvoiceKind,
    identifier: string
  ): Promise<string> {
    const existing =
      await this.getInvoiceXmlObject(
        kind,
        identifier
      );

    if (!existing) {
      throw new MoneyInvoiceError(
        `Invoice not found: ${identifier}`
      );
    }

    return await this.writeImportFile(
      "delete",
      kind,
      {
        GUID:
          existing.GUID,

        Doklad:
          existing.Doklad,

        VarSymbol:
          existing.VarSymbol,

        DeleteImport:
          "1"
      }
    );
  }


  async createInvoice(
    invoice: NewMoneyInvoice
  ): Promise<MoneyInvoice> {
    await this.syncFromMoney();

    const generated =
      await this.createInvoiceImport(
        invoice
      );

    const report =
      await this.runner
        .importXmlIntoMoney(
          generated.filePath
        );

    await this.syncFromMoney();

    const created =
      await this.getInvoice(
        invoice.kind,
        generated.documentNumber
      );

    if (!created) {
      throw new MoneyInvoiceError(
        [
          "Money S3 import finished, but the invoice was not found afterwards.",
          `Document: ${generated.documentNumber}`,
          `Variable symbol: ${generated.variableSymbol}`,
          `Import report: ${report}`
        ].join("\n")
      );
    }

    return created;
  }


  async updateInvoice(
    kind: MoneyInvoiceKind,
    identifier: string,
    changes: MoneyInvoiceUpdate
  ): Promise<MoneyInvoice> {
    await this.syncFromMoney();

    const before =
      await this.getInvoice(
        kind,
        identifier
      );

    if (!before) {
      throw new MoneyInvoiceError(
        `Invoice not found: ${identifier}`
      );
    }

    const importFile =
      await this.updateInvoiceImport(
        kind,
        identifier,
        changes
      );

    const report =
      await this.runner
        .importXmlIntoMoney(
          importFile
        );

    await this.syncFromMoney();

    const updated =
      await this.getInvoice(
        kind,
        before.documentNumber
      );

    if (!updated) {
      throw new MoneyInvoiceError(
        [
          "Money S3 update finished, but the invoice was not found afterwards.",
          `Document: ${before.documentNumber}`,
          `Import report: ${report}`
        ].join("\n")
      );
    }

    return updated;
  }


  async deleteInvoice(
    kind: MoneyInvoiceKind,
    identifier: string
  ): Promise<void> {
    await this.syncFromMoney();

    const before =
      await this.getInvoice(
        kind,
        identifier
      );

    if (!before) {
      throw new MoneyInvoiceError(
        `Invoice not found: ${identifier}`
      );
    }

    const importFile =
      await this.deleteInvoiceImport(
        kind,
        identifier
      );

    const report =
      await this.runner
        .importXmlIntoMoney(
          importFile
        );

    await this.syncFromMoney();

    const remaining =
      await this.getInvoice(
        kind,
        before.documentNumber
      );

    if (remaining) {
      throw new MoneyInvoiceError(
        [
          "Money S3 delete import finished, but the invoice still exists.",
          `Document: ${before.documentNumber}`,
          `Import report: ${report}`
        ].join("\n")
      );
    }
  }
}
