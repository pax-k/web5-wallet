/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable require-await */
import { LevelDB } from "react-native-leveldb";
import {
  AssociateResult,
  Cid,
  DataStore as Web5DataStore,
  DataStream,
  GetResult,
  PutResult,
} from "@tbd54566975/dwn-sdk-js";
import { Readable } from "readable-stream";
import { Buffer } from "buffer";

export class DataStore implements Web5DataStore {
  #data: Blockstore;
  #references: ReferencesStore;

  constructor() {
    this.#createDataDb();
    this.#createReferencesDb();
  }

  async open(): Promise<void> {
    if (this.#data.closed()) {
      this.#createDataDb();
    }
    if (this.#references.closed()) {
      this.#createReferencesDb();
    }
    return Promise.resolve();
  }

  async close(): Promise<void> {
    this.#data.close();
    this.#references.close();
    return Promise.resolve();
  }

  async put(
    tenant: string,
    messageCid: string,
    dataCid: string,
    dataStream: Readable
  ): Promise<PutResult> {
    this.#references.addMessageCidReference(tenant, dataCid, messageCid);
    return this.#data.putData(tenant, dataCid, dataStream);
  }

  async get(
    tenant: string,
    messageCid: string,
    dataCid: string
  ): Promise<GetResult | undefined> {
    const allowed = this.#references.hasMessageCidReference(
      tenant,
      dataCid,
      messageCid
    );

    if (allowed) {
      return this.#data.getData(tenant, dataCid);
    } else {
      return undefined;
    }
  }

  async associate(
    tenant: string,
    messageCid: string,
    dataCid: string
  ): Promise<AssociateResult | undefined> {
    const getResult = this.#data.getData(tenant, dataCid);
    if (!getResult) {
      // The data doesn't exist, so the provided messageCid can't be associated to it.
      return undefined;
    }

    this.#references.addMessageCidReference(tenant, dataCid, messageCid);
    return {
      dataCid: getResult.dataCid,
      dataSize: getResult.dataSize,
    };
  }

  async delete(
    tenant: string,
    messageCid: string,
    dataCid: string
  ): Promise<void> {
    const remainingReferences = this.#references.deleteMessageCidReference(
      tenant,
      dataCid,
      messageCid
    );

    if (remainingReferences <= 0) {
      // No more references to this data. Delete it.
      this.#data.deleteData(tenant, dataCid);
    }
  }

  async clear(): Promise<void> {
    this.#references.clear();
    this.#data.clear();
  }

  #createDataDb() {
    // this.#data = new LevelDB("DATA", true, false);
    this.#data = new Blockstore("DATATESTING", true, false);
  }

  #createReferencesDb() {
    // this.#references = new LevelDB("REFERENCES", true, false);
    this.#references = new ReferencesStore("REFERENCESTESTING", true, false);
  }
}

// MARK: - References

abstract class Store extends LevelDB {
  clear() {
    const i = this.newIterator();
    for (i.seekToFirst(); i.valid(); i.next()) {
      this.delete(i.keyStr());
    }
  }
}

class ReferencesStore extends Store {
  hasMessageCidReference(tenant: string, dataCid: string, messageCid: string) {
    const messageCids = this.#fetchMessageCidReferences(tenant, dataCid);
    return messageCids.has(messageCid);
  }

  // Returns the number of messages that are allowed to access the tenant/dataCid combo
  addMessageCidReference(
    tenant: string,
    dataCid: string,
    messageCid: string
  ): number {
    const messageCids = this.#fetchMessageCidReferences(tenant, dataCid);
    if (messageCids.has(messageCid)) {
      // Already has a reference. Early exit.
      return messageCids.size;
    }

    messageCids.add(messageCid);
    this.#updateMessageCids(tenant, dataCid, messageCids);
    return messageCids.size;
  }

  // Returns the number of messages that are allowed to access the tenant/dataCid combo
  deleteMessageCidReference(
    tenant: string,
    dataCid: string,
    messageCid: string
  ): number {
    const messageCids = this.#fetchMessageCidReferences(tenant, dataCid);
    if (!messageCids.has(messageCid)) {
      // No reference to delete. Early exit.
      return messageCids.size;
    }

    messageCids.delete(messageCid);
    this.#updateMessageCids(tenant, dataCid, messageCids);
    return messageCids.size;
  }

  #fetchMessageCidReferences(tenant: string, dataCid: string): Set<string> {
    const key = this.#key(tenant, dataCid);
    const str = this.getStr(key);
    if (str) {
      return new Set(JSON.parse(str));
    } else {
      return new Set<string>();
    }
  }

  #updateMessageCids(
    tenant: string,
    dataCid: string,
    messageCids: Set<string>
  ) {
    const key = this.#key(tenant, dataCid);
    console.log("START Putting updatedMessageCids");
    this.put(key, JSON.stringify(Array.from(messageCids)));
    console.log("DONE Putting updatedMessageCids");
  }

  #key(tenant: string, dataCid: string): string {
    return `${tenant}${dataCid}`;
  }
}

// MARK: - Blockstore

class Blockstore extends Store {
  hasData(tenant: string, dataCid: string): boolean {
    const data = this.getBuf(this.#key(tenant, dataCid));
    return data !== undefined;
  }

  async putData(
    tenant: string,
    dataCid: string,
    dataStream: Readable
  ): Promise<PutResult> {
    const bytes = await DataStream.toBytes(dataStream);
    this.put(this.#key(tenant, dataCid), bytes.buffer);

    return {
      dataCid: await Cid.computeDagPbCidFromBytes(bytes),
      dataSize: bytes.length,
    };
  }

  getData(tenant: string, dataCid: string): GetResult | undefined {
    const buffer = this.getBuf(this.#key(tenant, dataCid));
    if (buffer) {
      return {
        dataCid: dataCid,
        dataSize: buffer.byteLength,
        dataStream: new Readable({
          read() {
            this.push(Buffer.from(buffer));
            this.push(null);
          },
        }),
      };
    } else {
      return undefined;
    }
  }

  deleteData(tenant: string, dataCid: string) {
    this.delete(this.#key(tenant, dataCid));
  }

  #key(tenant: string, dataCid: string): string {
    return `${tenant}.${dataCid}`;
  }
}
