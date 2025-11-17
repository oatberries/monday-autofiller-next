'use client'

import React from "react";
import { useState, useEffect, useRef } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
//Explore more Monday React Components here: https://vibe.monday.com/
import { AttentionBox, Button } from "@vibe/core";
import { ITEM_NAME_AND_VALUES, BOARD_NAME,FILE_URL} from "./lib/queries";
import { runQuery } from "./lib/monday";
import { Checkbox } from "@vibe/core";
import { renderAsync } from "docx-preview";

// Usage of mondaySDK example, for more information visit here: https://developer.monday.com/apps/docs/introduction-to-the-sdk/
const monday = mondaySdk();
const WANTED_TITLES = ["CSP", "DR#", "Type of Case", "Petitioner", "Respondent"];
const TEMPLATE_BOARD_NAME = "TRA Templates";
const ORDER_GROUP_TITLE = "Orders";

export default function Page() {
  
  const [context, setContext] = useState();
  const [boardId, setBoardId] = useState(null);
  const [itemId, setItemId] = useState(null);

  const [caseType, setCaseType] = useState(null);
  const[petitioner, setPetitioner] = useState(null);
  const[respondent, setRespondent] = useState(null);
  const [csp, setCsp] = useState(null);
  const [drNumber, setDRNumber] = useState(null);

  const[publicUrl, setPublicUrl] = useState(null);
  const [error, setError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewRef = useRef(null); // container for the preview
  const [templateBoardId, setTemplateBoardId] = useState(null);
  const [templateGroupId, setTemplateGroupId] = useState(null);
  const [templateItemName, setTemplateItemName] = useState(null);
  const [templateItemId, setTemplateItemId] = useState(null);


  useEffect(() => {
    async function fetchContext() {
      try {
        const { data } = await monday.get("context"); 
        // data contains { boardId, itemId, ... }
        setBoardId(data.boardId);
        setItemId(data.itemId);
      } catch (err) {
        console.error("Error getting context:", err);
      }
    }

    fetchContext();
    
  }, []);

  useEffect(() => {
    if (!itemId) return;

    (async () => {
      try {
        const data = await runQuery(ITEM_NAME_AND_VALUES, { itemId: [itemId] });
        const item = data?.items?.[0];
        const cvs = item?.column_values ?? [];

        //Keep only CSP, DR#, Type of Case, Respondent, and Petitioner
        const wanted = cvs.filter(cv => WANTED_TITLES.includes(cv?.column?.title));
        const byTitle = Object.fromEntries(
          wanted.map(cv => [cv.column.title, cv.text ?? ""])
        );

        setCaseType(byTitle["Type of Case"] ?? "");
        setPetitioner(byTitle["Petitioner"] ?? "");
        setRespondent(byTitle["Respondent"] ?? "");
        setCsp(byTitle["CSP"] ?? "");
        setDRNumber(byTitle["DR#"] ?? "");
        setTemplateItemName(byTitle["Type of Case"] ?? "");

      } catch (e) {
        setError(e.message || "Failed to fetch item values");
        console.error(e);
      }
    })();
  }, [itemId]);

  useEffect(() => {
    async function fetchTemplateContext(){
      try{
        const data = await runQuery(BOARD_NAME);
        const boards = data?.boards ?? [];

        const templateBoard = boards.find(
        (b) => b.name.trim().toLowerCase() === TEMPLATE_BOARD_NAME.toLowerCase()
        );
        
        setTemplateBoardId(templateBoard.id);
        if(!templateBoard){
          console.error("Template board not found!");
        }

        const templateGroup = templateBoard.groups.find(
          (g) => g.title.trim().toLowerCase() === ORDER_GROUP_TITLE.toLowerCase()
        );
        
        if(!templateGroup){
          console.error("Template group not found");
        }
        setTemplateGroupId(templateGroup.id);

        const items = templateGroup.items_page?.items ?? [];
        const templateItem = items.find(
          (i) => i.name.trim().toLowerCase() === templateItemName.toLowerCase()
        );

        if(!templateItem){
          console.error("Template item not found!");
        }
        setTemplateItemId(templateItem.id);

      }catch(err){
        console.error("Error getting context:", err);
      }
    }

    fetchTemplateContext();
  }, [TEMPLATE_BOARD_NAME, ORDER_GROUP_TITLE, templateItemName]);

  async function getDocxPublicUrl(templateItemId) {
    const data = await runQuery(FILE_URL, { itemId: [templateItemId] });
    const assets = data?.items?.[0]?.assets || [];
    // Prefer .docx templates
    const docx = assets.find(a => (a.file_extension || "").toLowerCase() === ".docx");
    if (!docx?.public_url) {
      throw new Error("No .docx with a public_url found on this item.");
    }
    setPublicUrl(docx.public_url);
    return docx.public_url; // short-lived; fetch immediately via proxy
  }

  async function fetchArrayBufferViaProxy(publicUrl) {
    const r = await fetch(`/api/file-proxy?u=${encodeURIComponent(publicUrl)}`);
    if (!r.ok) throw new Error(`Proxy fetch failed: ${r.status}`);
    return r.arrayBuffer();
  }

  //Click handler to preview the DOCX
  async function handlePreviewClick() {
    if (!itemId) return;
    setLoadingPreview(true);
    setError("");

    try {
      const publicUrl = await getDocxPublicUrl(templateItemId);
      const ab = await fetchArrayBufferViaProxy(publicUrl);

      // Clear previous preview
      if (previewRef.current) {
        previewRef.current.innerHTML = "";
      }
      // Render the DOCX into the container
      await renderAsync(ab, previewRef.current, null, {
        // options: https://www.npmjs.com/package/docx-preview
        inWrapper: true,
        ignoreFonts: true,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to preview document");
    } finally {
      setLoadingPreview(false);
    }
  }




  useEffect(() => {
    // Notice this method notifies the monday platform that user gains a first value in an app.
    // Read more about it here: https://developer.monday.com/apps/docs/mondayexecute#value-created-for-user/
    monday.execute("valueCreatedForUser");

    // TODO: set up event listeners, Here`s an example, read more here: https://developer.monday.com/apps/docs/mondaylisten/
    monday.listen("context", (res) => {
      setContext(res.data);
    });
  }, []);

  //Some example what you can do with context, read more here: https://developer.monday.com/apps/docs/mondayget#requesting-context-and-settings-data
  const attentionBoxText =
    `Hello! Board ID: ${boardId ?? "loading"}, Item ID: ${itemId ?? "loading"}`;

  return (
    <div className="App">
      <AttentionBox title="Hello Monday Apps!" text={attentionBoxText} type="success" />

      <div style={{ padding: 16 }}>
        {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
        <h2>Current Item Fields</h2>
        <p><strong>boardId:</strong> {boardId || "—"}</p>
        <p><strong>itemId:</strong> {itemId || "—"}</p>
        <p><strong>Type of case:</strong> {caseType || "—"}</p>
        <p><strong>Petitioner:</strong> {petitioner || "—"}</p>
        <p><strong>Respondent:</strong> {respondent || "—"}</p>
        <p><strong>CSP:</strong> {csp || "—"}</p>
        <p><strong>DR#:</strong> {drNumber || "—"}</p>

        <div style={{ marginTop: 24, marginBottom: 12 }}>
          <Button onClick={handlePreviewClick} disabled={!itemId || loadingPreview}>
            {loadingPreview ? "Loading preview..." : "Preview DOCX template"}
          </Button>
        </div>

        <p><strong>Templates Board ID:</strong> {templateBoardId || "—"}</p>
        <p><strong>Templates Group ID:</strong> {templateGroupId || "—"}</p>
        <p><strong>Templates Item Name:</strong> {templateItemName || "—"}</p>
        <p><strong>Templates Item ID:</strong> {templateItemId || "—"}</p>
        <p><strong>DOCX Public URL:</strong> {publicUrl || "—"}</p>


      </div>

      {/* Preview container */}
        <div
          ref={previewRef}
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            maxHeight: 300,
            padding: 16,
            background: "white",
          }}
        />

      

    </div>
    
  );
}


