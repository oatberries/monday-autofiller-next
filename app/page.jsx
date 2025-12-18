'use client'

import React from "react";
import { useState, useEffect, useRef } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
import { AttentionBox, Button } from "@vibe/core";
import { ITEM_NAME_AND_VALUES, FILE_URL, ORDER_TYPES, FILE_NAMES, TEMPLATE_BOARD_AND_GROUP} from "./lib/queries";
import { runQuery } from "./lib/monday";
import { Checkbox, Accordion, AccordionItem } from "@vibe/core";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";

const monday = mondaySdk();
const WANTED_TITLES = ["CSP", "DR#", "Type of Case", "Petitioner", "Respondent"];
const TEMPLATE_BOARD_NAME = "TRA Templates";
const ORDER_GROUP_TITLE = "Orders";
const ORDER_TYPES_CACHE_KEY = "orderTypesCache_v1";


function fillTemplate(ab, { petitioner, respondent, csp, drNumber }, filename = "output.docx") {

  const uint8 = new Uint8Array(ab);
  const zip = new PizZip(uint8);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  
  doc.setData({
    petitioner,
    respondent,
    csp,
    drNumber,
  });

  try {
    doc.render();
  } catch (error) {
    console.error("Docxtemplater render error:", error);
    throw new Error("Failed to render template");
  }

  const out = doc.getZip().generate({
    type: "arraybuffer",
  });

  const blob = doc.getZip().generate(
    {
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
  );

  saveAs(blob, filename);

  return out;
}

async function getSelectedDocPublicUrl(templateItemId, docName) {
  
  const data = await runQuery(FILE_URL, { itemId: [templateItemId] });

  const assets = data?.items?.[0]?.assets || [];

  //Find the asset whose name matches the selected doc name
  const asset = assets.find((a) => a.name === docName);

  if (!asset?.public_url) {
    throw new Error("No file with a public URL found for the selected document.");
  }

  return asset.public_url; //short-lived; we’ll fetch it immediately via proxy
}

async function fetchArrayBufferViaProxy(publicUrl) {
  const r = await fetch(`/api/file-proxy?u=${encodeURIComponent(publicUrl)}`);
  if (!r.ok) throw new Error(`Proxy fetch failed: ${r.status}`);
  return r.arrayBuffer();
}


export default function Page() {
  
  const [context, setContext] = useState();
  const [boardId, setBoardId] = useState(null);
  const [itemId, setItemId] = useState(null);

  const[petitioner, setPetitioner] = useState(null);
  const[respondent, setRespondent] = useState(null);
  const [csp, setCsp] = useState(null);
  const [drNumber, setDRNumber] = useState(null);

  //const[publicUrl, setPublicUrl] = useState(null);
  const [error, setError] = useState("");
  const [templateBoardId, setTemplateBoardId] = useState(null);
  const [templateGroupId, setTemplateGroupId] = useState(null);
  const [templateItemName, setTemplateItemName] = useState(null);
  const [templateItemId, setTemplateItemId] = useState(null);
  const [orderTypes, setOrderTypes] = useState([]);
  const [document, setDocuments] = useState([{documents: ''}]);
  const [openOrderType, setOpenOrderType] = useState(null);
  const [docNamesByItem, setDocNamesByItem] = useState({});
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [fillingDoc, setFillingDoc] = useState(false);




  //KEEP: this fetches the boardId for the board that we need the petitioner, respondent, csp, and dr number
  //this happens instantly
  useEffect(() => {
    async function fetchContext() {
      try {
        const { data } = await monday.get("context"); 
        setBoardId(data.boardId);
        setItemId(data.itemId);
      } catch (err) {
        console.error("Error getting context:", err);
      }
    }

    fetchContext();
    
  }, []);
  
  //this use effect is to give this app a lil speed boost by finding the template board and group id right from the start
  useEffect(() => {
  async function resolveTemplateBoardAndGroup() {
    try {
      const data = await runQuery(TEMPLATE_BOARD_AND_GROUP);
      const boards = data?.boards ?? [];

      //Find the board by name
      const templateBoard = boards.find(
        (b) =>
          b.name &&
          b.name.trim().toLowerCase() === TEMPLATE_BOARD_NAME.toLowerCase()
      );

      if (!templateBoard) {
        console.error("Template board not found");
        return;
      }

      //Inside that board, find the group by title
      const templateGroup = (templateBoard.groups ?? []).find(
        (g) =>
          g.title &&
          g.title.trim().toLowerCase() === ORDER_GROUP_TITLE.toLowerCase()
      );

      if (!templateGroup) {
        console.error("Template group not found");
        return;
      }

      setTemplateBoardId(Number(templateBoard.id));
      setTemplateGroupId(templateGroup.id);
    } catch (err) {
      console.error("Error resolving template board/group:", err);
      setError("Failed to resolve template board/group.");
    }
  }

    resolveTemplateBoardAndGroup();
  }, []);

  //KEEP: here we extract the values that we need to fill the template with
  useEffect(() => {
    if (!itemId) return;

    (async () => {
      try {
        const data = await runQuery(ITEM_NAME_AND_VALUES, { itemId: [itemId] });
        const item = data?.items?.[0];
        const cvs = item?.column_values ?? [];

        //Keep only CSP, DR#, Respondent, and Petitioner
        const wanted = cvs.filter(cv => WANTED_TITLES.includes(cv?.column?.title));
        const byTitle = Object.fromEntries(
          wanted.map(cv => [cv.column.title, cv.text ?? ""])
        );

        setPetitioner(byTitle["Petitioner"] ?? "");
        setRespondent(byTitle["Respondent"] ?? "");
        setCsp(byTitle["CSP"] ?? "");
        setDRNumber(byTitle["DR#"] ?? "");

      } catch (e) {
        setError(e.message || "Failed to fetch item values");
        console.error(e);
      }
    })();
  }, [itemId]);

  
  //New function: here we're gonna extract the names of each order type
  useEffect(() => {
  //Don’t query until we know both ids
  if (!templateBoardId || !templateGroupId) return;

  let cancelled = false;

  async function fetchOrderTypes() {
    try {

      const cached = await monday.storage.instance.getItem(ORDER_TYPES_CACHE_KEY);

      if (!cancelled && cached?.data?.orders && Array.isArray(cached.data.orders)) {
        setOrderTypes(cached.data.orders);
        return;
      }


      const data = await runQuery(ORDER_TYPES, {
        boardIds: [templateBoardId],
        groupIds: [templateGroupId],
      });

      const boards = data?.boards ?? [];
      const groups = boards[0]?.groups ?? [];
      const group = groups[0];
      const items = group?.items_page?.items ?? [];

      if (!cancelled) {
        setOrderTypes(items);

        await monday.storage.instance.setItem(ORDER_TYPES_CACHE_KEY, {
          orders: items,
        });
      }
      //setOrderTypes(items); //items already have { id, name }

      
    } catch (err) {
      if (!cancelled) {
        console.error("Error fetching order types:", err);
        setError("Failed to fetch order types.");
      }
      //console.error("Error fetching order types:", err);
      //setError("Failed to fetch order types.");
    }
  }

  fetchOrderTypes();
  return () => {
    cancelled = true;
  };

}, [templateBoardId, templateGroupId]);


  useEffect(() => {
  //if we don't have an item id yet, do nothing
  if (!templateItemId) return;

  //if (docNamesByItem[templateItemId]) return;

  async function fetchFileNames() {
    try {
      const data = await runQuery(FILE_NAMES, { itemId: [templateItemId] });

      //data.items is an array; we want the first item's assets
      const assets = data?.items?.[0]?.assets ?? [];

      const docs = assets.map(a => ({
        name: a.name,
        //try file_extension first, fall back to checking the name
        isDocx:
          (a.file_extension && a.file_extension.toLowerCase() === "docx") ||
          a.name.toLowerCase().endsWith(".docx"),
      }));

      setDocNamesByItem(prev => ({
        ...prev,
        [templateItemId]: docs,
      }));

    } catch (err) {
      console.error("Error getting file names:", err);
    }
  }

  fetchFileNames();
}, [templateItemId]);

async function handleFillAndDownloadClick() {

  if (selectedDocs.length === 0) {
    setError("Please select at least one document first.");
    return;
  }

  setError("");
  setFillingDoc(true);

  try {

    //for (const docName of selectedDocs) {
    for (const { itemId: templateItemId, docName } of selectedDocs) {

    //Get the public URL for the asset matching `selectedDoc`
    const publicUrl = await getSelectedDocPublicUrl(templateItemId, docName);

    //Download the DOCX bytes through your proxy
    const ab = await fetchArrayBufferViaProxy(publicUrl);

    //Fill the template with the current item’s values
    await fillTemplate(ab, {
      petitioner: petitioner || "",
      respondent: respondent || "",
      csp: csp || "",
      drNumber: drNumber || "",
    }, docName);

  }
    //`fillTemplate` already calls `saveAs(blob, "output.docx")`,
    //so the user will get a download automatically here.
  } catch (e) {
    console.error(e);
    setError(e.message || "Failed to fill and download documents.");
  } finally {
    setFillingDoc(false);
  }
}

function toggleDocSelection(itemId, docName) {
  setSelectedDocs(prev => {
    const exists = prev.find(
      d => d.itemId === itemId && d.docName === docName
    );

    if (exists) {
      //uncheck: remove that pair
      return prev.filter(
        d => !(d.itemId === itemId && d.docName === docName)
      );
    }

    //check: add new pair
    return [...prev, { itemId, docName }];
  });
}


  useEffect(() => {
    monday.execute("valueCreatedForUser");
  }, []);

    const groupedSelectedDocs = selectedDocs.reduce((acc, { itemId, docName }) => {
    const order = orderTypes.find((o) => o.id === itemId);
    const orderLabel = order ? order.name : `Order ${itemId}`;

    if (!acc[orderLabel]) {
      acc[orderLabel] = [];
    }
    acc[orderLabel].push(docName);

    return acc;
  }, {});

  return (
    <div className="App tra-root">
      <div className="tra-shell">
        <header className="tra-header">
          <div>
            <h1 className="tra-title">TRA Document Filler</h1>
            <p className="tra-subtitle">
              Select order types and .docx templates to auto-fill with this item&apos;s data.
            </p>
          </div>
          {fillingDoc && (
            <span className="tra-status-tag">Working…</span>
          )}
        </header>

        <main className="tra-layout">
          {/* LEFT COLUMN: Order types & templates */}
          <section className="tra-column tra-column--orders">
            <h2 className="tra-section-title">Order types</h2>

            <div className="tra-card tra-card--scroll">
              <Accordion id="orderTypeList">
                {orderTypes.map((order) => (
                  <AccordionItem
                    key={order.id}
                    title={order.name}
                    onClick={() => {
                      setOpenOrderType(order.id);
                      setTemplateItemId(order.id);
                    }}
                  >
                    {openOrderType === order.id && (
                      <div className="tra-doc-list">
                        {(docNamesByItem[order.id] || []).length === 0 ? (
                          <div className="tra-empty-text">
                            No documents attached to this order type.
                          </div>
                        ) : (
                          (docNamesByItem[order.id] || []).map(({ name: label, isDocx }) => (
                            <div
                              key={label}
                              className="tra-doc-row"
                            >
                              <Checkbox
                                label={label}
                                disabled={!isDocx}
                                checked={
                                  isDocx &&
                                  selectedDocs.some(
                                    (d) => d.itemId === order.id && d.docName === label
                                  )
                                }
                                onChange={() => {
                                  if (isDocx) {
                                    toggleDocSelection(order.id, label);
                                  }
                                }}
                                ariaLabel={label}
                              />

                              {!isDocx && (
                                <span className="tra-doc-warning">
                                  This file must be .docx to be autofilled
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* RIGHT COLUMN: Item details, selection summary, actions */}
          <section className="tra-column tra-column--details">
            {/* Error box */}
            {error && (
              <div className="tra-card">
                <AttentionBox
                  title="Something went wrong"
                  text={error}
                  type={AttentionBox.types.DANGER}
                />
              </div>
            )}

            {/* Current item fields */}
            <div className="tra-card">
              <h2 className="tra-section-title">Current item fields</h2>
              <dl className="tra-fields-grid">
                <div>
                  <dt>Board ID</dt>
                  <dd>{boardId || "—"}</dd>
                </div>
                <div>
                  <dt>Item ID</dt>
                  <dd>{itemId || "—"}</dd>
                </div>
                <div>
                  <dt>Petitioner</dt>
                  <dd>{petitioner || "—"}</dd>
                </div>
                <div>
                  <dt>Respondent</dt>
                  <dd>{respondent || "—"}</dd>
                </div>
                <div>
                  <dt>CSP</dt>
                  <dd>{csp || "—"}</dd>
                </div>
                <div>
                  <dt>DR#</dt>
                  <dd>{drNumber || "—"}</dd>
                </div>
              </dl>
            </div>

            {/* Selected docs summary */}
            {selectedDocs.length > 0 && (
              <div className="tra-card">
                <h2 className="tra-section-title">Selected documents</h2>
                <ul className="tra-selected-list">
                  {Object.entries(groupedSelectedDocs).map(([orderLabel, docs]) => (
                    <li key={orderLabel} className="tra-selected-group">
                      <span className="tra-selected-order">{orderLabel}</span>
                      <ul className="tra-selected-docs">
                        {docs.map((name) => (
                          <li key={orderLabel + name}>{name}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Primary action */}
            <div className="tra-footer">
              <Button
                onClick={handleFillAndDownloadClick}
                disabled={selectedDocs.length === 0 || fillingDoc}
                size={Button.sizes.LARGE}
              >
                {fillingDoc ? "Filling documents..." : "Fill & download selected docs"}
              </Button>
              {selectedDocs.length === 0 && (
                <span className="tra-footer-hint">
                  Select at least one .docx template from the list on the left.
                </span>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}


