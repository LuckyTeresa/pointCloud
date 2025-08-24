import {TaskHandler} from "./task-handler";

const taskHandler = new TaskHandler(self);

const messageHandler = (e) => {
    const context = e.data;
    const {taskType, data} = e.data;

    taskHandler.handleTask(e.data)
        .then((res) => {
            if (res) {
                const transfer = res.transfer;
                res.transfer = undefined;
                self.postMessage({
                    success: true,
                    context,
                    result: res.data,
                    transfer: transfer || [],
                });
            }
        })
        .catch(reason => {
            const result = {
                context,
                success: false,
                reason,
            };
            self.postMessage(result);
        })
}

self.onmessage = messageHandler;