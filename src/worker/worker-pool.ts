import MainWorker from './worker.ts?worker'

interface Task {
    id: string;
    task: any;
    callback: (result: any) => void;
}

export class WorkerPool {
    private workers: Worker[];
    private taskQueue: (any)[];
    private maxWorkers: number;
    private idleWorkers: Set<Worker>;
    private taskCount: number;
    private taskCallbacks: Map<string, (result: any) => void>;

    constructor(maxWorkers: number) {
        this.maxWorkers = maxWorkers;
        this.workers = [];
        this.idleWorkers = new Set();
        this.taskQueue = [];
        this.taskCount = 0;
        this.taskCallbacks = new Map();

        for (let i = 0; i < maxWorkers; i++) {
            // const worker = new MainWorker();
            // worker.onmessage = this.onWorkerMessage.bind(this, worker);
            // worker.onerror = this.onWorkerError.bind(this, worker);
            // this.workers.push(worker);
            // this.idleWorkers.add(worker);
        }
    }


    public addTask(task: any, callback: (result: any) => void): void {
        const taskId = this.generateTaskId();
        const taskData = {
            id: taskId,
            taskType: task.taskType,
            data: task.data,
        };
        this.taskCallbacks.set(taskId, callback);
        if (this.idleWorkers.size > 0) {
            this.executeTask(taskData);
        } else if (this.taskCount < this.maxWorkers) {
            const worker = new MainWorker();
            worker.onmessage = this.onWorkerMessage.bind(this, worker);
            worker.onerror = this.onWorkerError.bind(this, worker);
            this.workers.push(worker);
            this.idleWorkers.add(worker);
            this.executeTask(taskData);
        } else {
            this.taskQueue.push(taskData);
        }
    }

    // 执行任务，分配给空闲的 Worker
    private executeTask(task: any): void {
        const worker = this.idleWorkers.values().next().value;
        if (worker) {
            this.idleWorkers.delete(worker); // 从空闲队列中移除
            this.taskCount++;
            // 这里可以将任务的数据传递给 Worker 执行，假设我们把任务作为 message 发送
            worker.postMessage(task);
        }
    }

    // 处理 Worker 任务完成后的回调
    private onWorkerMessage(worker: Worker, e: MessageEvent): void {
        const postData = e.data;
        const id = postData.context.id;
        const callback = this.taskCallbacks.get(id);

        if (callback) {
            callback(postData.result);  // 调用回调函数并传递结果
            this.taskCallbacks.delete(id);  // 清除回调函数
        }
        // 完成任务后，将 Worker 重新加入到空闲 Workers 集合
        this.idleWorkers.add(worker);
        this.taskCount--;

        // 如果有等待的任务，立即分配任务给空闲的 Worker
        if (this.taskQueue.length > 0) {
            const nextTask = this.taskQueue.shift();
            if (nextTask) {
                this.executeTask(nextTask);
            }
        }
    }

    private onWorkerError(worker: Worker, e: ErrorEvent): void {
        console.error('Worker error:', e.message);
    }

    public terminate(): void {
        this.workers.forEach(worker => worker.terminate());
    }

    private generateTaskId(): string {
        // return 'task-' + Math.random().toString(36).substr(2, 9);
        return 'task-' + new Date().getTime() + '';
    }
}